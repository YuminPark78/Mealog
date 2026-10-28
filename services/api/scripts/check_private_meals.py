from datetime import UTC, datetime
from getpass import getpass
from uuid import uuid4

import httpx
from supabase import PostgrestAPIError, create_client

from mealog_api.config import settings


def sign_in(label):
    client = create_client(
        settings.supabase_url,
        settings.supabase_publishable_key,
    )

    email = input(f"{label} email: ").strip()
    password = getpass(f"{label} password: ")

    result = client.auth.sign_in_with_password({"email": email, "password": password})

    if result.session is None or result.user is None:
        raise RuntimeError(f"{label} login failed.")

    return client, result.session.access_token, result.user.id


def main():
    alice_client, alice_token, alice_id = sign_in("Alice")
    bob_client, bob_token, bob_id = sign_in("Bob")

    assert alice_id != bob_id, "Use two different accounts."

    marker = uuid4().hex[:8]
    payload = {
        "name": f"Alice privacy test {marker}",
        "carbohydrates_g": 40,
        "eaten_at": datetime.now(UTC).isoformat(),
        "notes": "Synthetic privacy test",
    }

    with httpx.Client(
        base_url="http://127.0.0.1:8000",
        timeout=15,
    ) as api:
        assert api.get("/meals").status_code == 401

        assert (
            api.get(
                "/meals",
                headers={"Authorization": "Bearer invalid-token"},
            ).status_code
            == 401
        )

        saved = api.post(
            "/meals",
            headers={"Authorization": f"Bearer {alice_token}"},
            json=payload,
        )

        assert saved.status_code == 201, saved.text
        alice_meal = saved.json()
        assert alice_meal["user_id"] == alice_id

        bob_response = api.get(
            "/meals",
            headers={"Authorization": f"Bearer {bob_token}"},
        )
        assert bob_response.status_code == 200, bob_response.text
        assert all(meal["user_id"] == bob_id for meal in bob_response.json())

        spoofed = api.post(
            "/meals",
            headers={"Authorization": f"Bearer {bob_token}"},
            json={**payload, "user_id": alice_id},
        )
        assert spoofed.status_code == 422, spoofed.text

    # Direct Supabase read as Bob: Alice's row must be invisible.
    result = bob_client.table("meals").select("id").eq("id", alice_meal["id"]).execute()
    assert result.data == []

    # Direct Supabase insert as Bob claiming Alice's ownership:
    # the database itself must reject it.
    try:
        bob_client.table("meals").insert({**payload, "user_id": alice_id}).execute()
    except PostgrestAPIError as error:
        assert error.code == "42501", error
    else:
        raise AssertionError("Bob inserted a meal owned by Alice.")

    # Alice can still read her own row.
    result = (
        alice_client.table("meals").select("id").eq("id", alice_meal["id"]).execute()
    )
    assert len(result.data) == 1

    print("PASS: API authentication and database ownership checks.")


if __name__ == "__main__":
    main()
