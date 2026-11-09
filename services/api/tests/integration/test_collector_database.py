"""Real PostgreSQL regression checks; all synthetic records are rolled back.

Opt in with MEALOG_TEST_DATABASE_URL pointing to migrated local Supabase.
The worker is scoped to the fixture's meal so existing jobs are never processed.
"""

import os
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import psycopg
import pytest
from cryptography.fernet import Fernet
from mealog_api.jobs import glucose_worker as worker
from mealog_api.schemas.glucose import SourceBatch, SourceReading
from psycopg.conninfo import conninfo_to_dict
from psycopg.rows import dict_row


@pytest.fixture
def case(monkeypatch):
    url = os.environ.get("MEALOG_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set MEALOG_TEST_DATABASE_URL to run real database checks.")
    if conninfo_to_dict(url).get("host") not in {"localhost", "127.0.0.1", "::1"}:
        pytest.fail("Database regression checks require local Supabase.")

    with psycopg.connect(url, row_factory=dict_row, autocommit=True) as db:
        db.execute("begin")
        try:
            user_id, other_id, meal_id, connection_id = (uuid4() for _ in range(4))
            for owner in (user_id, other_id):
                db.execute("insert into auth.users (id) values (%s)", (owner,))
            db.execute(
                """insert into public.dexcom_connections
                   (id, user_id, region, source_account_id) values (%s, %s, 'ous', 'test-source')""",
                (connection_id, user_id),
            )
            cipher = Fernet(Fernet.generate_key())
            db.execute(
                "insert into mealog_private.dexcom_credentials values (%s, %s)",
                (connection_id, cipher.encrypt(b"{}").decode()),
            )
            eaten_at = datetime.now(UTC).replace(microsecond=0) - timedelta(hours=3)
            db.execute(
                "insert into public.meals (id, user_id, name, eaten_at) values (%s, %s, 'Collector regression', %s)",
                (meal_id, user_id, eaten_at),
            )

            @contextmanager
            def transaction():
                with db.transaction():
                    yield db

            monkeypatch.setattr(worker, "connect_database", transaction)
            monkeypatch.setattr(worker, "credential_cipher", lambda: cipher)
            readings = [
                SourceReading(
                    measured_at=eaten_at
                    - timedelta(hours=2)
                    + timedelta(minutes=5 * i),
                    glucose_mg_dl=100 + i,
                )
                for i in range(49)
            ]
            yield (
                db,
                meal_id,
                user_id,
                other_id,
                SourceBatch(account_id="test-source", readings=readings),
            )
        finally:
            db.execute("rollback")


def count(db, meal_id):
    return db.execute(
        """select count(*) as n from public.glucose_readings
           where connection_id = (select connection_id from public.meal_glucose_windows where meal_id = %s)""",
        (meal_id,),
    ).fetchone()["n"]


def requeue(db, meal_id, *, attempts=0, kind="initial"):
    db.execute(
        "update mealog_private.glucose_jobs set done = true where meal_id = %s",
        (meal_id,),
    )
    db.execute(
        """update mealog_private.glucose_jobs set done = false, attempts = %s, run_at = now()
           where meal_id = %s and kind = %s""",
        (attempts, meal_id, kind),
    )


def test_repeated_and_overlapping_jobs_do_not_duplicate_readings(case):
    db, meal_id, _, _, batch = case
    assert worker.process_one(lambda _: batch, meal_id=meal_id)
    assert count(db, meal_id) == 49
    assert worker.process_one(
        lambda _: batch, meal_id=meal_id
    )  # final job, same readings
    assert count(db, meal_id) == 49
    assert not worker.process_one(lambda _: batch, meal_id=meal_id)
    requeue(db, meal_id)
    worker.process_one(lambda _: batch, meal_id=meal_id)
    assert count(db, meal_id) == 49


def test_conflicting_source_value_is_flagged_without_overwriting(case):
    db, meal_id, _, _, batch = case
    worker.process_one(lambda _: batch, meal_id=meal_id)
    changed = batch.model_copy(deep=True)
    changed.readings[0].glucose_mg_dl = 222
    worker.process_one(lambda _: changed, meal_id=meal_id)
    row = db.execute(
        "select glucose_mg_dl, conflict_detected from public.glucose_readings where measured_at = %s and connection_id = (select connection_id from public.meal_glucose_windows where meal_id = %s)",
        (batch.readings[0].measured_at, meal_id),
    ).fetchone()
    assert row == {"glucose_mg_dl": 100, "conflict_detected": True}
    assert count(db, meal_id) == 49


def test_interruption_rolls_back_partial_batch_and_restart_retries(case, monkeypatch):
    db, meal_id, _, _, batch = case
    original_connect = worker.connect_database

    class InterruptedDatabase:
        inserts = 0

        def execute(self, query, params=None):
            if "insert into public.glucose_readings" in query:
                self.inserts += 1
                if self.inserts == 2:
                    raise RuntimeError("Simulated worker interruption")
            return db.execute(query, params)

    @contextmanager
    def interrupted_transaction():
        with db.transaction():
            yield InterruptedDatabase()

    monkeypatch.setattr(worker, "connect_database", interrupted_transaction)
    with pytest.raises(RuntimeError, match="Simulated worker interruption"):
        worker.process_one(lambda _: batch, meal_id=meal_id)
    assert (
        db.execute(
            "select count(*) as n from public.glucose_readings where user_id = (select user_id from public.meals where id = %s)",
            (meal_id,),
        ).fetchone()["n"]
        == 0
    )
    assert (
        db.execute(
            "select bool_or(done) as done from mealog_private.glucose_jobs where meal_id = %s",
            (meal_id,),
        ).fetchone()["done"]
        is False
    )
    monkeypatch.setattr(worker, "connect_database", original_connect)
    assert worker.process_one(lambda _: batch, meal_id=meal_id)
    assert count(db, meal_id) == 49


def test_retry_and_exhaustion_status(case):
    db, meal_id, _, _, _ = case

    def fail(_):
        raise RuntimeError("Simulated source outage")

    requeue(db, meal_id, kind="final")
    worker.process_one(fail, meal_id=meal_id)
    job = db.execute(
        "select attempts, done, run_at > now() as delayed from mealog_private.glucose_jobs where meal_id = %s and kind = 'final'",
        (meal_id,),
    ).fetchone()
    assert job == {"attempts": 1, "done": False, "delayed": True}
    requeue(db, meal_id, attempts=2, kind="final")
    worker.process_one(fail, meal_id=meal_id)
    assert (
        db.execute(
            "select status from public.meal_glucose_windows where meal_id = %s",
            (meal_id,),
        ).fetchone()["status"]
        == "failed"
    )


def test_future_meal_is_deferred_and_source_account_mismatch_rejected(case):
    db, meal_id, _, _, batch = case
    db.execute(
        "update public.meals set eaten_at = now() + interval '4 hours' where id = %s",
        (meal_id,),
    )
    calls = []
    worker.process_one(lambda _: calls.append(True), meal_id=meal_id)
    assert calls == []
    job = db.execute(
        "select done, run_at > now() as delayed from mealog_private.glucose_jobs where meal_id = %s and kind = 'initial'",
        (meal_id,),
    ).fetchone()
    assert job == {"done": False, "delayed": True}
    db.execute(
        "update public.meals set eaten_at = now() - interval '3 hours' where id = %s",
        (meal_id,),
    )
    worker.process_one(
        lambda _: batch.model_copy(update={"account_id": "wrong-account"}),
        meal_id=meal_id,
    )
    assert (
        db.execute(
            "select count(*) as n from public.glucose_readings where user_id = (select user_id from public.meals where id = %s)",
            (meal_id,),
        ).fetchone()["n"]
        == 0
    )


def test_database_privacy_and_insulin_edit_permissions(case):
    db, meal_id, owner, other, batch = case
    worker.process_one(lambda _: batch, meal_id=meal_id)
    event_id = uuid4()
    db.execute(
        """insert into public.insulin_events (id, user_id, meal_id, dose_units, injected_at)
           values (%s, %s, %s, 2.5, now())""",
        (event_id, owner, meal_id),
    )
    db.execute("set local role authenticated")
    db.execute("select set_config('request.jwt.claim.sub', %s, true)", (str(other),))
    for table in (
        "meals",
        "glucose_readings",
        "meal_glucose_windows",
        "insulin_events",
        "dexcom_connections",
    ):
        assert (
            db.execute(
                f"select count(*) as n from public.{table} where user_id = %s", (owner,)
            ).fetchone()["n"]
            == 0
        )
    assert (
        db.execute(
            "update public.insulin_events set dose_units = 3 where id = %s", (event_id,)
        ).rowcount
        == 0
    )
    db.execute("select set_config('request.jwt.claim.sub', %s, true)", (str(owner),))
    assert (
        db.execute(
            "update public.insulin_events set dose_units = 3 where id = %s", (event_id,)
        ).rowcount
        == 1
    )
    row = db.execute(
        "select dose_units, updated_at from public.insulin_events where id = %s",
        (event_id,),
    ).fetchone()
    assert row["dose_units"] == 3 and row["updated_at"] is not None
    # Column privileges reject changing ownership, even to another valid account.
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        db.execute(
            "update public.insulin_events set user_id = %s where id = %s",
            (other, event_id),
        )
    db.execute("reset role")


def test_event_time_corrections_change_audit_time_but_noops_preserve_it(case):
    db, meal_id, _, _, _ = case
    db.execute(
        """update public.meals set activity_after = 'light_activity', activity_at = %s,
           notes = 'A walk', notes_at = %s where id = %s""",
        ("2026-11-09T12:30:00+08:00", "2026-11-09T12:35:00+08:00", meal_id),
    )
    db.execute(
        "update public.meals set context_updated_at = '2000-01-01Z' where id = %s",
        (meal_id,),
    )
    db.execute(
        "update public.meals set activity_at = '2026-11-09T04:30:00Z' where id = %s",
        (meal_id,),
    )
    row = db.execute(
        "select activity_at, notes_at, context_updated_at from public.meals where id = %s",
        (meal_id,),
    ).fetchone()
    assert row["activity_at"].astimezone(UTC).hour == 4
    assert row["notes_at"].minute == 35
    assert row["context_updated_at"].year == 2000
    db.execute(
        "update public.meals set activity_at = '2026-11-09T04:40:00Z' where id = %s",
        (meal_id,),
    )
    assert db.execute(
        "select context_updated_at = now() as changed from public.meals where id = %s",
        (meal_id,),
    ).fetchone()["changed"]
    db.execute(
        "update public.meals set activity_after = null, activity_at = null where id = %s",
        (meal_id,),
    )
    assert (
        db.execute(
            "select activity_at from public.meals where id = %s", (meal_id,)
        ).fetchone()["activity_at"]
        is None
    )
