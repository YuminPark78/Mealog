alter table public.dexcom_connections
    add column last_check_at timestamptz,
    add column last_check_ok boolean;
