-- Existing meals remain unowned.
alter table public.meals
    add column user_id uuid
    references auth.users(id)
    on delete cascade;

-- Future inserts can derive ownership from the authenticated user.
alter table public.meals
    alter column user_id set default auth.uid();

create index meals_user_eaten_at_idx
    on public.meals (user_id, eaten_at desc, id desc);

-- Remove the old permissive prototype policies.
drop policy if exists "Prototype can read synthetic meals"
    on public.meals;

drop policy if exists "Prototype can insert synthetic meals"
    on public.meals;

alter table public.meals enable row level security;


-- Logged-out requests have no table access.
-- Logged-in users receive only SELECT and INSERT previleges.
revoke all on public.meals from public, anon, authenticated;
grant select, insert on public.meals to authenticated;

create policy "Users can read their own meals"
on public.meals
for select
to authenticated
using (
    user_id = (select auth.uid())
);

create policy "Users can insert their own meals"
on public.meals
for insert
to authenticated
with check (
    user_id = (select auth.uid())
);