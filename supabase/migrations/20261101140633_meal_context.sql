alter table public.meals

    add column activity_after text
        check (
            activity_after in (
                'mostly_sitting',
                'light_activity',
                'intense_exercise',
                'other_mixed'
            )
        ),

    add column fraction_consumed numeric
        check (fraction_consumed between 0 and 1),

    add column context_updated_at timestamptz;


-- Users may update context fields, but not ownership or other columns.
grant update (
    activity_after,
    fraction_consumed,
    notes
)
on public.meals
to authenticated;


create policy "Users can update their own meal context"
on public.meals
for update
to authenticated
using (
    user_id = (select auth.uid())
)
with check (
    user_id = (select auth.uid())
);


-- Automatically timestamp context updates.
create function public.set_meal_context_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.context_updated_at = now();
    return new;
end;
$$;


create trigger meal_context_updated_at
before update of
    activity_after,
    fraction_consumed,
    notes
on public.meals
for each row
execute function public.set_meal_context_updated_at();