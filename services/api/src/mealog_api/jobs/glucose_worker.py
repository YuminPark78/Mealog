import argparse
import json
import logging
import time
from datetime import UTC, datetime, timedelta

from mealog_api.collector_config import (
    connect_database,
    credential_cipher,
)
from mealog_api.integrations.dexcom import fetch_recent
from mealog_api.schemas.glucose import assess_coverage

logger = logging.getLogger(__name__)


def stored_times(db, job, connection_id):
    rows = db.execute(
        """
        select measured_at
        from public.glucose_readings
        where connection_id = %s
          and measured_at between %s and %s
          and conflict_detected = false
        order by measured_at
        """,
        (
            connection_id,
            job["window_start"],
            job["window_end"],
        ),
    ).fetchall()

    return [row["measured_at"] for row in rows]


def finish_job(db, job, status, connection_id=None, error=None):
    db.execute(
        """
        update public.meal_glucose_windows
        set status = %s,
            connection_id = coalesce(%s, connection_id),
            last_attempt_at = now(),
            last_error = %s
        where meal_id = %s
        """,
        (
            status,
            connection_id,
            error,
            job["meal_id"],
        ),
    )

    db.execute(
        """
        update mealog_private.glucose_jobs
        set done = true
        where id = %s
        """,
        (job["job_id"],),
    )


def process_one(fetcher=fetch_recent, *, meal_id=None) -> bool:
    # The transaction holds the job/window locks until completion.
    # A crash rolls back its changes and leaves the job available.
    with connect_database() as db:
        job = db.execute(
            """
            select
                job.id as job_id,
                job.kind,
                job.attempts,
                glucose_window.*
            from mealog_private.glucose_jobs as job
            join public.meal_glucose_windows as glucose_window
                on glucose_window.meal_id = job.meal_id
            where job.done = false
              and job.run_at <= now()
              and (%s::uuid is null or job.meal_id = %s::uuid)
            order by job.run_at
            limit 1
            for update of job, glucose_window skip locked
            """,
            (meal_id, meal_id),
        ).fetchone()

        if job is None:
            return False

        acquired = db.execute(
            "select pg_try_advisory_xact_lock(hashtextextended(%s, 0)) as acquired",
            (str(job["user_id"]),),
        ).fetchone()

        if acquired is None or not acquired["acquired"]:
            return False

        now = datetime.now(UTC)

        connection = db.execute(
            """
            select connection.id,
                   connection.source_account_id,
                   credentials.ciphertext
            from public.dexcom_connections as connection
            left join mealog_private.dexcom_credentials as credentials
                on credentials.connection_id = connection.id
            where connection.user_id = %s
              and connection.enabled = true
            """,
            (job["user_id"],),
        ).fetchone()

        if connection is None or connection["ciphertext"] is None:
            finish_job(
                db,
                job,
                "awaiting_connection",
                error="connection_required",
            )
            return True

        connection_id = connection["id"]

        # No source request can recover a window entirely older
        # than the lookback limit. Existing stored data is retained.
        if job["window_end"] < now - timedelta(hours=24):
            status = assess_coverage(
                job["window_start"],
                job["window_end"],
                stored_times(db, job, connection_id),
                now,
            )

            finish_job(
                db,
                job,
                status,
                connection_id,
                error="outside_source_history",
            )
            return True

        if job["window_start"] > now:
            # Keep the initial job available when a future meal becomes due.
            db.execute(
                "update mealog_private.glucose_jobs set run_at = %s where id = %s",
                (job["window_start"], job["job_id"]),
            )
            return True

        try:
            credentials = json.loads(
                credential_cipher().decrypt(connection["ciphertext"].encode())
            )

            batch = fetcher(credentials)

            if batch.account_id != connection["source_account_id"]:
                raise RuntimeError("Source account mismatch.")

        except Exception:
            attempts = job["attempts"] + 1
            retry = attempts < 3

            db.execute(
                """
                update mealog_private.glucose_jobs
                set attempts = %s,
                    done = %s,
                    run_at = %s
                where id = %s
                """,
                (
                    attempts,
                    not retry,
                    now + timedelta(minutes=5 * attempts),
                    job["job_id"],
                ),
            )

            status = (
                "pending"
                if retry
                or (
                    job["kind"] == "initial"
                    and now < job["window_end"] + timedelta(minutes=10)
                )
                else "failed"
            )

            db.execute(
                """
                update public.meal_glucose_windows
                set status = %s,
                    last_attempt_at = now(),
                    last_error = 'source_error'
                where meal_id = %s
                """,
                (status, job["meal_id"]),
            )

            logger.warning("Glucose retrieval failed; attempt %s", attempts)
            return True

        for reading in batch.readings:
            if not (job["window_start"] <= reading.measured_at <= job["window_end"]):
                continue

            db.execute(
                """
                insert into public.glucose_readings as existing (
                    user_id,
                    connection_id,
                    measured_at,
                    glucose_mg_dl,
                    trend
                )
                values (%s, %s, %s, %s, %s)
                on conflict (connection_id, measured_at)
                do update set
                    last_seen_at = now(),
                    conflict_detected =
                        existing.conflict_detected
                        or existing.glucose_mg_dl
                           <> excluded.glucose_mg_dl
                """,
                (
                    job["user_id"],
                    connection_id,
                    reading.measured_at,
                    reading.glucose_mg_dl,
                    reading.trend,
                ),
            )

        status = assess_coverage(
            job["window_start"],
            job["window_end"],
            stored_times(db, job, connection_id),
            datetime.now(UTC),
        )

        finish_job(db, job, status, connection_id)
        return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    if args.once:
        process_one()
        return

    try:
        while True:
            try:
                processed = process_one()
            except Exception as error:
                # Do not log credentials or source response bodies.
                logger.error(
                    "Worker failure: %s",
                    type(error).__name__,
                )
                processed = False

            if not processed:
                time.sleep(5)

    except KeyboardInterrupt:
        logger.info("Glucose worker stopped.")


if __name__ == "__main__":
    main()
