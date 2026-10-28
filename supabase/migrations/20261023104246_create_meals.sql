create table public.meals (
    id uuid primary key default gen_random_uuid(),

    name text not null
        check (char_length(btrim(name)) between 1 and 200),

    carbohydrates_g numeric(8, 2)
        check (
            carbohydrates_g >= 0
            and carbohydrates_g <> 'NaN'::numeric
        ),

    eaten_at timestamptz not null,

    notes text
        check (char_length(notes) <= 2000),

    created_at timestamptz not null default now()
);

create index meals_eaten_at_idx
    on public.meals (eaten_at desc, id desc);

alter table public.meals enable row level security;

grant select, insert on public.meals to anon, authenticated;

create policy "Prototype can read synthetic meals"
on public.meals
for select
to anon, authenticated
using (true);

create policy "Prototype can insert synthetic meals"
on public.meals
for insert
to anon, authenticated
with check (true);