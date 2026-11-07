import argparse
import json
from getpass import getpass

from supabase import create_client

from mealog_api.collector_config import (
    connect_database,
    credential_cipher,
)
from mealog_api.config import settings
from mealog_api.integrations.dexcom import fetch_recent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--disconnect", action="store_true")
    args = parser.parse_args()

    auth_client = create_client(
        settings.supabase_url,
        settings.supabase_publishable_key,
    )

    email = input("Mealog email: ").strip()
    password = getpass("Mealog password: ")

    login = auth_client.auth.sign_in_with_password({
        "email": email,
        "password": password,
    })

    if login.user is None or login.session is None:
        raise RuntimeError("Mealog login failed.")

    user_id = login.user.id

    if args.disconnect:
        with connect_database() as db:
            connection = db.execute(
                """
                select id
                from public.dexcom_connections
                where user_id = %s
                for update
                """,
                (user_id,),
            ).fetchone()

            if connection:
                db.execute(
                    """
                    delete from mealog_private.dexcom_credentials
                    where connection_id = %s
                    """,
                    (connection["id"],),
                )

                db.execute(
                    """
                    update public.dexcom_connections
                    set enabled = false
                    where id = %s
                    """,
                    (connection["id"],),
                )

        print("Disconnected. Previously collected readings remain stored.")
        return

    credentials = {
        "username": input("Dexcom publishing username: ").strip(),
        "password": getpass("Dexcom publishing password: "),
        "region": input("Dexcom region [us/ous/jp]: ").strip().lower(),
    }

    batch = fetch_recent(credentials)

    ciphertext = credential_cipher().encrypt(
        json.dumps(credentials).encode()
    ).decode()

    with connect_database() as db:
        existing = db.execute(
            """
            select id, region, source_account_id
            from public.dexcom_connections
            where user_id = %s
            for update
            """,
            (user_id,),
        ).fetchone()

        if existing:
            if (
                existing["source_account_id"] != batch.account_id
                or existing["region"] != credentials["region"]
            ):
                raise RuntimeError(
                    "Changing the linked Dexcom account is not "
                    "supported by this initial setup script."
                )

            connection_id = existing["id"]

            db.execute(
                """
                update public.dexcom_connections
                set enabled = true
                where id = %s
                """,
                (connection_id,),
            )
        else:
            connection = db.execute(
                """
                insert into public.dexcom_connections (
                    user_id, region, source_account_id
                )
                values (%s, %s, %s)
                returning id
                """,
                (
                    user_id,
                    credentials["region"],
                    batch.account_id,
                ),
            ).fetchone()

            if connection is None:
                raise RuntimeError("Creating the Dexcom connection returned no row.")

            connection_id = connection["id"]

        db.execute(
            """
            insert into mealog_private.dexcom_credentials (
                connection_id, ciphertext
            )
            values (%s, %s)
            on conflict (connection_id)
            do update set ciphertext = excluded.ciphertext
            """,
            (connection_id, ciphertext),
        )

        db.execute(
            """
            update mealog_private.glucose_jobs as job
            set done = false,
                attempts = 0,
                run_at = now()
            from public.meal_glucose_windows as glucose_window
            where job.meal_id = glucose_window.meal_id
              and glucose_window.user_id = %s
              and glucose_window.window_end >= now() - interval '24 hours'
              and glucose_window.status <> 'ready'
              and job.kind = 'initial'
            """,
            (user_id,),
        )

    print("Dexcom connection verified and saved.")


if __name__ == "__main__":
    main()
