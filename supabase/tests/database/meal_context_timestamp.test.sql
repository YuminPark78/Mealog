begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

-- Synthetic unowned row; this transaction runs as the test database owner.
insert into public.meals (id, name, eaten_at)
values ('08b70854-4206-4dbd-bfc9-fd97d27f3672', 'Timestamp regression', now());

update public.meals
set activity_after = null, fraction_consumed = null, notes = null
where id = '08b70854-4206-4dbd-bfc9-fd97d27f3672';

select is(
    (select context_updated_at from public.meals
     where id = '08b70854-4206-4dbd-bfc9-fd97d27f3672'),
    null::timestamptz,
    'An all-null submission preserves an unset timestamp'
);

update public.meals set fraction_consumed = 0
where id = '08b70854-4206-4dbd-bfc9-fd97d27f3672';

select is(
    (select context_updated_at from public.meals
     where id = '08b70854-4206-4dbd-bfc9-fd97d27f3672'),
    now(),
    'Recording zero consumption updates the timestamp'
);

-- Use an older timestamp to distinguish unchanged and changed updates;
-- now() is constant throughout a PostgreSQL transaction.
update public.meals set context_updated_at = '2000-01-01T00:00:00Z'
where id = '08b70854-4206-4dbd-bfc9-fd97d27f3672';

update public.meals set fraction_consumed = 0
where id = '08b70854-4206-4dbd-bfc9-fd97d27f3672';

select is(
    (select context_updated_at from public.meals
     where id = '08b70854-4206-4dbd-bfc9-fd97d27f3672'),
    '2000-01-01T00:00:00Z'::timestamptz,
    'Resubmitting the same value preserves the timestamp'
);

update public.meals set fraction_consumed = null
where id = '08b70854-4206-4dbd-bfc9-fd97d27f3672';

select is(
    (select context_updated_at from public.meals
     where id = '08b70854-4206-4dbd-bfc9-fd97d27f3672'),
    now(),
    'Clearing a recorded value updates the timestamp'
);

select is(
    (select fraction_consumed from public.meals
     where id = '08b70854-4206-4dbd-bfc9-fd97d27f3672'),
    null::numeric,
    'Clearing a recorded value persists null'
);

select * from finish();
rollback;
