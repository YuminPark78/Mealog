import json
from uuid import UUID

from fastapi import HTTPException
from supabase import ClientOptions, create_client

from mealog_api.collector_config import connect_database, credential_cipher
from mealog_api.config import settings
from mealog_api.integrations.dexcom import DexcomFetchError, fetch_recent
from mealog_api.schemas.account import ConnectDexcom, DexcomStatus


def _lock_user(db, user_id: UUID):
    # The worker must use the matching try-lock shown in the guide.
    # Serialise account mutations, including connect, disconnect and delete.
    db.execute("set local lock_timeout = '5s'")
    db.execute(
        "select pg_advisory_xact_lock(hashtextextended(%s, 0))",
        (str(user_id),),
    )


def _require_user(db, user_id: UUID):
    row = db.execute(
        "select id from auth.users where id = %s for key share",
        (user_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(401, "Please log in again.")


def dexcom_status(user_id: UUID) -> DexcomStatus:
    with connect_database() as db:
        # Every privileged SQL query is scoped to the authenticated user.
        connection = db.execute(
            """
            select c.id, c.enabled, c.region, c.last_check_at,
                   c.last_check_ok,
                   exists (
                       select 1 from mealog_private.dexcom_credentials as d
                       where d.connection_id = c.id
                   ) as has_credentials
            from public.dexcom_connections as c
            where c.user_id = %s
            """,
            (user_id,),
        ).fetchone()
        if connection is None:
            return DexcomStatus(state="not_connected")

        latest = db.execute(
            """
            select max(measured_at) as measured_at
            from public.glucose_readings
            where user_id = %s and connection_id = %s
              and conflict_detected = false
            """,
            (user_id, connection["id"]),
        ).fetchone()
        attempt = db.execute(
            """
            select last_attempt_at, last_error
            from public.meal_glucose_windows
            where user_id = %s and last_attempt_at is not null
            order by last_attempt_at desc limit 1
            """,
            (user_id,),
        ).fetchone()
        pending = db.execute(
            """
            select count(*) as count
            from mealog_private.glucose_jobs as j
            join public.meal_glucose_windows as w on w.meal_id = j.meal_id
            where w.user_id = %s and j.done = false
            """,
            (user_id,),
        ).fetchone()

        enabled = connection["enabled"]
        if not enabled:
            state = "disconnected"
        elif not connection["has_credentials"] or connection["last_check_ok"] is False:
            state = "needs_attention"
        else:
            state = "connected"

        return DexcomStatus(
            state=state,
            region=connection["region"],
            last_check_at=connection["last_check_at"],
            last_check_ok=connection["last_check_ok"],
            latest_reading_at=latest["measured_at"] if latest else None,
            last_collection_attempt_at=attempt["last_attempt_at"] if attempt else None,
            collection_needs_attention=bool(
                enabled and attempt and attempt["last_error"] == "source_error"
                and (
                    connection["last_check_at"] is None
                    or attempt["last_attempt_at"] >= connection["last_check_at"]
                )
            ),
            pending_jobs=pending["count"] if pending else 0,
        )


def connect_dexcom(user_id: UUID, payload: ConnectDexcom) -> DexcomStatus:
    credentials = {
        "username": payload.username.strip(),
        "password": payload.password.get_secret_value(),
        "region": payload.region,
    }
    if not credentials["username"]:
        raise HTTPException(422, "Enter your Dexcom username.")

    with connect_database() as db:
        _lock_user(db, user_id)
        _require_user(db, user_id)
        try:
            batch = fetch_recent(credentials)
        except DexcomFetchError:
            raise HTTPException(
                502,
                "Could not verify Dexcom. Check your credentials, region and Share setup.",
            ) from None

        existing = db.execute(
            """
            select id, region, source_account_id
            from public.dexcom_connections where user_id = %s for update
            """,
            (user_id,),
        ).fetchone()
        if existing and (
            existing["source_account_id"] != batch.account_id
            or existing["region"] != payload.region
        ):
            raise HTTPException(
                409,
                "This Mealog account is already linked to a different Dexcom account. "
                "Changing the source account is not supported yet.",
            )

        connection = db.execute(
            """
            insert into public.dexcom_connections (
                user_id, region, source_account_id, enabled,
                last_check_at, last_check_ok
            ) values (%s, %s, %s, true, now(), true)
            on conflict (user_id) do update set
                enabled = true, last_check_at = now(), last_check_ok = true
            returning id
            """,
            (user_id, payload.region, batch.account_id),
        ).fetchone()
        if connection is None:
            raise RuntimeError("Failed to save Dexcom connection.")
        ciphertext = credential_cipher().encrypt(json.dumps(credentials).encode()).decode()
        db.execute(
            """
            insert into mealog_private.dexcom_credentials (connection_id, ciphertext)
            values (%s, %s)
            on conflict (connection_id) do update set ciphertext = excluded.ciphertext
            """,
            (connection["id"], ciphertext),
        )
        # Resume recoverable meal jobs using their correct initial/final times.
        db.execute(
            """
            update mealog_private.glucose_jobs as j
            set done = false, attempts = 0,
                run_at = case when j.kind = 'initial'
                    then greatest(now(), w.window_start)
                    else greatest(now(), w.window_end + interval '10 minutes') end
            from public.meal_glucose_windows as w
            where j.meal_id = w.meal_id and w.user_id = %s
              and w.window_end >= now() - interval '24 hours'
              and w.status <> 'ready'
            """,
            (user_id,),
        )
    return dexcom_status(user_id)


def check_dexcom(user_id: UUID) -> DexcomStatus:
    with connect_database() as db:
        _lock_user(db, user_id)
        _require_user(db, user_id)
        row = db.execute(
            """
            select c.id, c.source_account_id, d.ciphertext
            from public.dexcom_connections as c
            join mealog_private.dexcom_credentials as d on d.connection_id = c.id
            where c.user_id = %s and c.enabled = true
            """,
            (user_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(409, "Connect your Dexcom account first.")
        try:
            credentials = json.loads(
                credential_cipher().decrypt(row["ciphertext"].encode())
            )
            batch = fetch_recent(credentials)
            ok = batch.account_id == row["source_account_id"]
        except Exception:
            ok = False
        # Persist a failed check rather than rolling it back with an exception.
        db.execute(
            """
            update public.dexcom_connections
            set last_check_at = now(), last_check_ok = %s
            where id = %s and user_id = %s
            """,
            (ok, row["id"], user_id),
        )
    return dexcom_status(user_id)


def disconnect_dexcom(user_id: UUID) -> DexcomStatus:
    with connect_database() as db:
        _lock_user(db, user_id)
        _require_user(db, user_id)
        db.execute(
            """
            delete from mealog_private.dexcom_credentials as d
            using public.dexcom_connections as c
            where d.connection_id = c.id and c.user_id = %s
            """,
            (user_id,),
        )
        db.execute(
            "update public.dexcom_connections set enabled = false where user_id = %s",
            (user_id,),
        )
    return dexcom_status(user_id)


def delete_account(user_id: UUID):
    key = settings.supabase_service_role_key
    if key is None:
        raise HTTPException(503, "Account deletion is not configured.")

    # Use a fresh admin client. Never attach a user's token to this client.
    admin = create_client(
        settings.supabase_url,
        key.get_secret_value(),
        options=ClientOptions(persist_session=False, auto_refresh_token=False),
    )
    with connect_database() as db:
        # Only the advisory lock is held here: do not lock auth.users, because
        # the Auth API deletes it using a different database connection.
        _lock_user(db, user_id)
        admin.auth.admin.delete_user(str(user_id), should_soft_delete=False)
    return {"deleted": True}
