create table public.meal_name_embeddings (
    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    embedding_model text not null,
    dish_name text not null,

    embedding double precision[] not null,

    created_at timestamptz not null default now(),

    primary key (user_id, embedding_model, dish_name),

    check (char_length(dish_name) > 0),
    check (array_ndims(embedding) = 1),
    check (array_length(embedding, 1) = 1536)
);

alter table public.meal_name_embeddings
    enable row level security;

revoke all on public.meal_name_embeddings
from public, anon, authenticated;

grant select, insert, update
on public.meal_name_embeddings
to authenticated;

create policy "Users can read their own meal embeddings"
on public.meal_name_embeddings
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can insert their own meal embeddings"
on public.meal_name_embeddings
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can update their own meal embeddings"
on public.meal_name_embeddings
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));