import hashlib
import json
from uuid import UUID

from postgrest.exceptions import APIError


class CreationRequestConflict(Exception):
    pass


def public_record(row: dict) -> dict:
    return {key: value for key, value in row.items()
            if key not in {"creation_request_id", "creation_request_hash"}}


def insert_once(client, table: str, payload: dict, request_id: UUID | None) -> list[dict]:
    if request_id is None:
        return [public_record(row) for row in client.table(table).insert(payload).execute().data]

    fingerprint = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()

    def replay():
        rows = (client.table(table).select("*")
                .eq("user_id", payload["user_id"])
                .eq("creation_request_id", str(request_id)).limit(1).execute().data)
        if not rows:
            return None
        if rows[0]["creation_request_hash"] != fingerprint:
            raise CreationRequestConflict
        return [public_record(rows[0])]

    existing = replay()
    if existing is not None:
        return existing
    try:
        rows = client.table(table).insert({
            **payload, "creation_request_id": str(request_id),
            "creation_request_hash": fingerprint,
        }).execute().data
        return [public_record(row) for row in rows]
    except APIError as error:
        # Concurrent retries can race the first SELECT; the unique constraint
        # resolves that race before this second, user-scoped lookup.
        if error.code == "23505":
            existing = replay()
            if existing is not None:
                return existing
        raise
