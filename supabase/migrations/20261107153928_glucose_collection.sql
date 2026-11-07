create schema if not exists mealog_private;

revoke all on schema mealog_private
from public, anon, authenticated;


-- One Dexcom connection per Mealog user in this initial version.
create table public.dexcom_connections (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null unique
        references auth.users(id)
        on delete cascade,

    region text not null
        check (region in ('us', 'ous', 'jp')),

    source_account_id text not null,
    enabled boolean not null default true,
    created_at timestamptz not null default now(),

    unique (id, user_id)
);

alter table public.dexcom_connections enable row level security;

revoke all on public.dexcom_connections
from public, anon, authenticated;

grant select on public.dexcom_connections to authenticated;

create policy "Users can read their own Dexcom connection"
on public.dexcom_connections
for select
to authenticated
using (user_id = (select auth.uid()));


-- Encrypted credentials are not accessible through the public API.
create table mealog_private.dexcom_credentials (
    connection_id uuid primary key
        references public.dexcom_connections(id)
        on delete cascade,

    ciphertext text not null
);


create table public.glucose_readings (
    user_id uuid not null,
    connection_id uuid not null,

    measured_at timestamptz not null,
    glucose_mg_dl integer not null check (glucose_mg_dl >= 0),
    trend text,

    first_collected_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    conflict_detected boolean not null default false,

    primary key (connection_id, measured_at),

    foreign key (connection_id, user_id)
        references public.dexcom_connections(id, user_id)
        on delete cascade
);

create index glucose_readings_user_time_idx
    on public.glucose_readings (user_id, measured_at);

alter table public.glucose_readings enable row level security;

revoke all on public.glucose_readings
from public, anon, authenticated;

grant select on public.glucose_readings to authenticated;

create policy "Users can read their own glucose"
on public.glucose_readings
for select
to authenticated
using (user_id = (select auth.uid()));


create table public.meal_glucose_windows (
    meal_id uuid primary key,
    user_id uuid not null,

    connection_id uuid,

    meal_time timestamptz not null,
    window_start timestamptz not null,
    window_end timestamptz not null,

    status text not null default 'pending'
        check (
            status in (
                'pending',
                'awaiting_connection',
                'ready',
                'partial',
                'failed'
            )
        ),

    last_attempt_at timestamptz,
    last_error text,

    check (window_end > window_start),

    foreign key (meal_id, user_id)
        references public.meals(id, user_id)
        on delete cascade,

    foreign key (connection_id, user_id)
        references public.dexcom_connections(id, user_id)
);

alter table public.meal_glucose_windows enable row level security;

revoke all on public.meal_glucose_windows
from public, anon, authenticated;

grant select on public.meal_glucose_windows to authenticated;

create policy "Users can read their own glucose windows"
on public.meal_glucose_windows
for select
to authenticated
using (user_id = (select auth.uid()));


create table mealog_private.glucose_jobs (
    id uuid primary key default gen_random_uuid(),

    meal_id uuid not null
        references public.meal_glucose_windows(meal_id)
        on delete cascade,

    kind text not null check (kind in ('initial', 'final')),
    run_at timestamptz not null,

    attempts integer not null default 0,
    done boolean not null default false,

    unique (meal_id, kind)
);

create index glucose_jobs_due_idx
    on mealog_private.glucose_jobs (run_at)
    where done = false;


-- Creating or changing a window queues its collection jobs.
create function public.queue_glucose_window_jobs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into mealog_private.glucose_jobs (
        meal_id, kind, run_at
    )
    values
        (new.meal_id, 'initial', now()),
        (
            new.meal_id,
            'final',
            greatest(
                now(),
                new.window_end + interval '10 minutes'
            )
        )
    on conflict (meal_id, kind)
    do update set
        run_at = excluded.run_at,
        attempts = 0,
        done = false;

    return new;
end;
$$;

revoke all on function public.queue_glucose_window_jobs()
from public, anon, authenticated;

create trigger queue_glucose_window_jobs
after insert or update of window_start, window_end
on public.meal_glucose_windows
for each row
execute function public.queue_glucose_window_jobs();


-- Meal and jobs are created in the same database transaction.
create function public.create_meal_glucose_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.user_id is null then
        return new;
    end if;

    insert into public.meal_glucose_windows (
        meal_id,
        user_id,
        meal_time,
        window_start,
        window_end
    )
    values (
        new.id,
        new.user_id,
        new.eaten_at,
        new.eaten_at - interval '2 hours',
        new.eaten_at + interval '2 hours'
    )
    on conflict (meal_id)
    do update set
        meal_time = excluded.meal_time,
        window_start = excluded.window_start,
        window_end = excluded.window_end,
        status = 'pending',
        last_error = null;

    return new;
end;
$$;

revoke all on function public.create_meal_glucose_window()
from public, anon, authenticated;

create trigger create_meal_glucose_window
after insert or update of eaten_at
on public.meals
for each row
execute function public.create_meal_glucose_window();


-- Backfill windows for existing owned meals.
insert into public.meal_glucose_windows (
    meal_id, user_id, meal_time, window_start, window_end
)
select
    id,
    user_id,
    eaten_at,
    eaten_at - interval '2 hours',
    eaten_at + interval '2 hours'
from public.meals
where user_id is not null;