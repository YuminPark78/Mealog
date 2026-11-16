-- Retried submissions must not create duplicate meals or insulin events.
alter table public.meals
    add column creation_request_id uuid,
    add column creation_request_hash text,
    add constraint meals_creation_request_unique unique (user_id, creation_request_id);

alter table public.insulin_events
    add column creation_request_id uuid,
    add column creation_request_hash text,
    add constraint insulin_creation_request_unique unique (user_id, creation_request_id);
