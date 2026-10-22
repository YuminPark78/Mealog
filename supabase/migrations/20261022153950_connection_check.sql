create table public.connection_checks (
    id integer primary key,
    message text not null
);

insert into public.connection_checks (id, message)
values (1, 'Hello from Supabase!');

alter table public.connection_checks enable row level security;

grant select on public.connection_checks to anon, authenticated;

create policy "Allow reading the synthetic connection check"
on public.connection_checks
for select
to anon, authenticated
using (id = 1);