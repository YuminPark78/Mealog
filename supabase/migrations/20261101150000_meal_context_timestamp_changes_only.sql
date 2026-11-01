-- Preserve the timestamp when a request writes the existing context values.
create or replace function public.set_meal_context_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if row(new.activity_after, new.fraction_consumed, new.notes)
        is distinct from
        row(old.activity_after, old.fraction_consumed, old.notes)
    then
        new.context_updated_at = now();
    else
        new.context_updated_at = old.context_updated_at;
    end if;

    return new;
end;
$$;
