"""Seed isolated, reproducible retrieval examples in local Supabase only.

Usage: uv run python scripts/seed_retrieval_demo.py [--verify | --cleanup]
All curves are invented mathematical examples, never real Dexcom observations.
"""

import argparse
import json
import math
import os
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID, uuid5

from psycopg.conninfo import conninfo_to_dict
from supabase import create_client

from mealog_api.collector_config import CollectorSettings, connect_database
from mealog_api.config import settings

ROOT = Path(__file__).resolve().parents[3]
MANIFEST = ROOT / "private-data" / "retrieval-demo.json"
FIXTURE = "mealog-retrieval-demo-v1"
EMAIL = "retrieval-demo@example.com"
NAMESPACE = UUID("10e3cbb8-ea46-4bb0-aa02-9efbdd8e33e7")
NOTE_PREFIX = f"SYNTHETIC TEST DATA [{FIXTURE}]"

# role, dish, full serving carbs, fraction consumed, age in days, window state
CASES = [
    ("reference_planned", "Guzman Bowl", 55, None, 0, "ready"),
    ("reference_semantic", "Guzman Bowl with Chicken", 55, 1, 0, "ready"),
    ("exact_match", "Guzman Bowl", 55, 1, 1, "ready"),
    ("shared_portion", "Guzman Bowl", 110, 0.5, 2, "ready"),
    ("similar_name", "Guzman Bowl with Chicken", 58, 1, 3, "ready"),
    ("partial_curve", "Guzman Bowl", 52, 1, 4, "partial"),
    ("carbs_too_high", "Guzman Bowl", 100, 1, 5, "ready"),
    ("different_dish", "Sushi", 55, 1, 6, "ready"),
    ("unknown_consumption", "Guzman Bowl", 55, None, 7, "ready"),
    ("not_eaten", "Guzman Bowl", 55, 0, 8, "ready"),
    ("unknown_carbs", "Guzman Bowl", None, 1, 9, "ready"),
    ("missing_glucose", "Guzman Bowl", 55, 1, 10, "awaiting_connection"),
    ("conflicting_glucose", "Guzman Bowl", 55, 1, 11, "partial"),
    ("future_meal", "Guzman Bowl", 55, 1, -2, "pending"),
]


def fixture_id(role):
    return uuid5(NAMESPACE, role)


def local_only():
    hosts = {"127.0.0.1", "localhost", "::1"}
    db_host = conninfo_to_dict(CollectorSettings().database_url.get_secret_value()).get(
        "host"
    )
    if db_host not in hosts or urlparse(settings.supabase_url).hostname not in hosts:
        raise RuntimeError("This fixture refuses non-local Supabase/database URLs.")


def save_manifest(data):
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(MANIFEST, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        os.fchmod(stream.fileno(), 0o600)
        json.dump(data, stream, indent=2)
        stream.write("\n")


def assert_fixture_owner(db, user_id):
    user = db.execute(
        "select email, raw_user_meta_data from auth.users where id = %s",
        (user_id,),
    ).fetchone()
    if (
        user is None
        or user["email"] != EMAIL
        or user["raw_user_meta_data"].get("synthetic_fixture") != FIXTURE
    ):
        raise RuntimeError("The account is not this script's isolated demo account.")


def sign_in_or_create():
    client = create_client(settings.supabase_url, settings.supabase_publishable_key)
    if MANIFEST.exists():
        data = json.loads(MANIFEST.read_text())
        if data.get("fixture") != FIXTURE or data.get("removed"):
            raise RuntimeError("Remove the old demo manifest before reseeding.")
        login = client.auth.sign_in_with_password(
            {
                "email": data["email"],
                "password": data["password"],
            }
        )
    else:
        with connect_database() as db:
            if db.execute(
                "select id from auth.users where email = %s",
                (EMAIL,),
            ).fetchone():
                raise RuntimeError(
                    "Demo email already exists without its credentials manifest."
                )
        data = {
            "fixture": FIXTURE,
            "email": EMAIL,
            "password": secrets.token_urlsafe(24),
        }
        login = client.auth.sign_up(
            {
                "email": data["email"],
                "password": data["password"],
                "options": {"data": {"synthetic_fixture": FIXTURE}},
            }
        )
        if login.user is not None:
            data["user_id"] = login.user.id
            save_manifest(data)
    if login.user is None or login.session is None:
        raise RuntimeError(
            "Demo login requires local email confirmations to be disabled."
        )
    data["user_id"] = login.user.id
    save_manifest(data)
    return data, login.session.access_token


def cleanup(data):
    owner = data["user_id"]
    with connect_database() as db:
        assert_fixture_owner(db, owner)
        # Refuse to erase user-created additions or a subsequently linked real account.
        extras = db.execute(
            "select count(*) as n from public.meals where user_id = %s and not (id = any(%s::uuid[]))",
            (owner, [fixture_id(case[0]) for case in CASES]),
        ).fetchone()["n"]
        connections = db.execute(
            "select id, enabled, source_account_id from public.dexcom_connections where user_id = %s",
            (owner,),
        ).fetchall()
        if extras or any(
            row["enabled"] or row["source_account_id"] != FIXTURE for row in connections
        ):
            raise RuntimeError(
                "Demo contains additional records or a real connection; cleanup refused."
            )
        # Delete windows before the connection to respect their non-cascading FK.
        db.execute(
            "delete from public.meal_glucose_windows where user_id = %s", (owner,)
        )
        db.execute("delete from auth.users where id = %s", (owner,))
    save_manifest({"fixture": FIXTURE, "removed": True})
    print("Removed the isolated demo account and its fixture records.")


def seed(data):
    owner = data["user_id"]
    connection_id = fixture_id("connection")
    # Keep reruns stable. Even the latest reference window has already finished.
    anchor = (
        datetime.fromisoformat(data["anchor"])
        if "anchor" in data
        else (datetime.now(UTC).replace(second=0, microsecond=0) - timedelta(hours=3))
    )
    data["anchor"] = anchor.isoformat()
    data["meals"] = []
    with connect_database() as db:
        assert_fixture_owner(db, owner)
        existing = db.execute(
            "select id, source_account_id, enabled from public.dexcom_connections where user_id = %s",
            (owner,),
        ).fetchone()
        if existing and (
            existing["id"] != connection_id
            or existing["source_account_id"] != FIXTURE
            or existing["enabled"]
        ):
            raise RuntimeError("Refusing to alter a non-fixture Dexcom connection.")
        db.execute(
            """insert into public.dexcom_connections
               (id, user_id, region, source_account_id, enabled)
               values (%s, %s, 'ous', %s, false) on conflict (id) do nothing""",
            (connection_id, owner, FIXTURE),
        )
        # Only this disabled fixture connection's invented samples are replaced.
        db.execute(
            "delete from public.glucose_readings where connection_id = %s",
            (connection_id,),
        )

        for index, (role, name, carbs, fraction, age, status) in enumerate(CASES):
            meal_id = fixture_id(role)
            eaten_at = anchor - timedelta(days=age)
            if role == "reference_semantic":
                eaten_at += timedelta(minutes=10)
            collision = db.execute(
                "select user_id, notes from public.meals where id = %s",
                (meal_id,),
            ).fetchone()
            if collision and (
                str(collision["user_id"]) != owner
                or not (collision["notes"] or "").startswith(NOTE_PREFIX)
            ):
                raise RuntimeError("Fixture ID is occupied by a non-fixture meal.")
            note = f"{NOTE_PREFIX}: {role}. Invented meal and glucose curve; not a real observation."
            db.execute(
                """insert into public.meals
                   (id, user_id, name, carbohydrates_g, fraction_consumed, eaten_at, notes, notes_at)
                   values (%s, %s, %s, %s, %s, %s, %s, %s)
                   on conflict (id) do update set
                       name=excluded.name, carbohydrates_g=excluded.carbohydrates_g,
                       fraction_consumed=excluded.fraction_consumed, eaten_at=excluded.eaten_at,
                       notes=excluded.notes, notes_at=excluded.notes_at""",
                (meal_id, owner, name, carbs, fraction, eaten_at, note, eaten_at),
            )
            db.execute(
                """update public.meal_glucose_windows
                   set connection_id=%s, status=%s, last_attempt_at=now(), last_error=null
                   where meal_id=%s and user_id=%s""",
                (connection_id, status, meal_id, owner),
            )
            if role not in {"missing_glucose", "future_meal"}:
                samples = []
                for minute in range(-120, 121, 5):
                    if role == "partial_curve" and 25 <= minute <= 45:
                        continue
                    baseline = 100 + (index % 5) * 5
                    amplitude = 30 + (index % 4) * 15
                    peak = 35 + (index % 3) * 15
                    value = round(
                        baseline + amplitude * math.exp(-(((minute - peak) / 32) ** 2))
                    )
                    samples.append(
                        (
                            owner,
                            connection_id,
                            eaten_at + timedelta(minutes=minute),
                            value,
                            role == "conflicting_glucose",
                        )
                    )
                with db.cursor() as cursor:
                    cursor.executemany(
                        """insert into public.glucose_readings
                           (user_id, connection_id, measured_at, glucose_mg_dl, conflict_detected)
                           values (%s, %s, %s, %s, %s)
                           on conflict (connection_id, measured_at) do nothing""",
                        samples,
                    )
            # The live worker must never try to replace fixture readings.
            db.execute(
                "update mealog_private.glucose_jobs set done=true where meal_id=%s",
                (meal_id,),
            )
            data["meals"].append(
                {
                    "role": role,
                    "id": str(meal_id),
                    "name": name,
                    "carbohydrates_g": carbs,
                    "fraction_consumed": fraction,
                    "status": status,
                    "eaten_at": eaten_at.isoformat(),
                }
            )
        count = db.execute(
            "select count(*) as n from public.glucose_readings where connection_id=%s",
            (connection_id,),
        ).fetchone()["n"]
        assert (
            db.execute(
                """select count(*) as n from mealog_private.glucose_jobs j
               join public.meals m on m.id=j.meal_id where m.user_id=%s and not j.done""",
                (owner,),
            ).fetchone()["n"]
            == 0
        )
        assert not db.execute(
            "select 1 from mealog_private.dexcom_credentials where connection_id=%s",
            (connection_id,),
        ).fetchone()
    data["synthetic_readings"] = count
    save_manifest(data)
    print(
        json.dumps(
            {
                "email": EMAIL,
                "meals": len(CASES),
                "synthetic_readings": count,
                "credentials_file": str(MANIFEST),
            }
        )
    )


def verify(data, token):
    from fastapi.testclient import TestClient
    from mealog_api.main import app

    role_by_id = {row["id"]: row["role"] for row in data["meals"]}
    headers = {"Authorization": f"Bearer {token}"}
    excluded = {
        "carbs_too_high",
        "different_dish",
        "unknown_consumption",
        "not_eaten",
        "unknown_carbs",
        "missing_glucose",
        "conflicting_glucose",
        "future_meal",
    }
    report = []
    with TestClient(app) as api:
        for role in ("reference_planned", "reference_semantic"):
            meal_id = str(fixture_id(role))
            response = api.post(f"/meals/{meal_id}/similar", headers=headers)
            if response.status_code != 200:
                raise RuntimeError(
                    f"Retrieval failed ({response.status_code}): {response.json().get('detail')}"
                )
            body = response.json()
            matches = body["matches"]
            assert matches, body["message"]
            assert len(matches) <= 3
            selected_roles = [role_by_id[match["meal"]["id"]] for match in matches]
            assert not excluded.intersection(selected_roles), selected_roles
            for match in matches:
                assert match["meal"]["user_id"] == data["user_id"]
                assert match["carbohydrate_difference_g"] <= 11
                assert any(
                    not reading["conflict_detected"]
                    for reading in match["snapshot"]["readings"]
                )
            again = api.post(f"/meals/{meal_id}/similar", headers=headers)
            assert again.status_code == 200
            assert [item["meal"]["id"] for item in again.json()["matches"]] == [
                item["meal"]["id"] for item in matches
            ]
            report.append(
                {
                    "reference": role,
                    "basis": body["basis"],
                    "matches": [
                        {
                            "role": role_by_id[match["meal"]["id"]],
                            "similarity": round(match["similarity"], 4),
                            "consumed_g": match["consumed_carbohydrates_g"],
                        }
                        for match in matches
                    ],
                }
            )
        # The fixture user's token must not reveal an actual user's meal.
        with connect_database() as db:
            other = db.execute(
                "select id from public.meals where user_id is not null and user_id<>%s limit 1",
                (data["user_id"],),
            ).fetchone()
        if other:
            assert (
                api.post(f"/meals/{other['id']}/similar", headers=headers).status_code
                == 404
            )
            assert (
                api.get(f"/meals/{other['id']}/glucose", headers=headers).status_code
                == 404
            )
    data["verification"] = report
    save_manifest(data)
    print(json.dumps({"verification": report, "privacy_check": "passed"}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--verify", action="store_true")
    group.add_argument("--cleanup", action="store_true")
    args = parser.parse_args()
    local_only()
    if args.cleanup:
        cleanup(json.loads(MANIFEST.read_text()))
        return
    data, token = sign_in_or_create()
    seed(data)
    if args.verify:
        verify(data, token)


if __name__ == "__main__":
    main()
