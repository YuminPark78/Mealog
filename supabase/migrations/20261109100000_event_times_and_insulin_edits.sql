-- Historical activity/note times are unknown; do not invent a backfill.
alter table public.meals
    add column activity_at timestamptz,
    add column notes_at timestamptz,
    add constraint activity_time_requires_activity
        check (activity_at is null or activity_after is not null),
    add constraint note_time_requires_note
        check (notes_at is null or nullif(btrim(notes), '') is not null);

grant update (activity_at, notes_at) on public.meals to authenticated;

create or replace function public.set_meal_context_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
    if row(new.activity_after, new.activity_at, new.fraction_consumed,
           new.notes, new.notes_at)
        is distinct from
       row(old.activity_after, old.activity_at, old.fraction_consumed,
           old.notes, old.notes_at)
    then
        new.context_updated_at = now();
    else
        new.context_updated_at = old.context_updated_at;
    end if;
    return new;
end;
$$;

drop trigger meal_context_updated_at on public.meals;
create trigger meal_context_updated_at
before update of activity_after, activity_at, fraction_consumed, notes, notes_at
on public.meals for each row
execute function public.set_meal_context_updated_at();

create index meals_activity_time_idx on public.meals (user_id, activity_at)
    where activity_at is not null;
create index meals_note_time_idx on public.meals (user_id, notes_at)
    where notes_at is not null;

alter table public.insulin_events
    add column updated_at timestamptz;

grant update (meal_id, dose_units, insulin_name, injected_at, notes)
on public.insulin_events to authenticated;

create policy "Users can update their own insulin events"
on public.insulin_events for update to authenticated
using (user_id = (select auth.uid()))
with check (
    user_id = (select auth.uid())
    and (meal_id is null or exists (
        select 1 from public.meals
        where meals.id = insulin_events.meal_id
          and meals.user_id = (select auth.uid())
    ))
);

create function public.set_insulin_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
    if row(new.meal_id, new.dose_units, new.insulin_name, new.injected_at, new.notes)
        is distinct from
       row(old.meal_id, old.dose_units, old.insulin_name, old.injected_at, old.notes)
    then
        new.updated_at = now();
    else
        new.updated_at = old.updated_at;
    end if;
    return new;
end;
$$;

create trigger insulin_updated_at
before update on public.insulin_events for each row
execute function public.set_insulin_updated_at();
