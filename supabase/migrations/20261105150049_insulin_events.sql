-- Required for a foreign key that checks both meal and owner.
alter table public.meals
    add constraint meals_id_user_id_unique
    unique (id, user_id);


create table public.insulin_events (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null default auth.uid()
        references auth.users(id)
        on delete cascade,

    meal_id uuid,

    dose_units numeric(8, 3) not null
        check (
            dose_units > 0
            and dose_units <> 'NaN'::numeric
        ),

    insulin_name text
        check (
            char_length(btrim(insulin_name)) between 1 and 100
        ),

    injected_at timestamptz not null,

    notes text
        check (char_length(notes) <= 2000),

    created_at timestamptz not null default now(),

    constraint insulin_events_owned_meal_fk
        foreign key (meal_id, user_id)
        references public.meals (id, user_id)
        on delete no action
);


create index insulin_events_user_time_idx
    on public.insulin_events (
        user_id,
        injected_at desc,
        id desc
    );

create index insulin_events_user_meal_idx
    on public.insulin_events (user_id, meal_id);


alter table public.insulin_events enable row level security;

revoke all
on public.insulin_events
from public, anon, authenticated;

grant select, insert
on public.insulin_events
to authenticated;


create policy "Users can read their own insulin events"
on public.insulin_events
for select
to authenticated
using (
    user_id = (select auth.uid())
);


create policy "Users can insert their own insulin events"
on public.insulin_events
for insert
to authenticated
with check (
    user_id = (select auth.uid())
    and (
        meal_id is null
        or exists (
            select 1
            from public.meals as meal
            where meal.id = insulin_events.meal_id
              and meal.user_id = (select auth.uid())
        )
    )
);