from types import SimpleNamespace
from uuid import uuid4

import pytest
from postgrest.exceptions import APIError

from mealog_api.repositories.creation_requests import CreationRequestConflict, insert_once


class Database:
    def __init__(self):
        self.rows = []
        self.committed_then_failed = False
        self.race = False

    def table(self, name):
        return Query(self, name)


class Query:
    def __init__(self, db, table):
        self.db, self.name, self.filters, self.payload = db, table, {}, None

    def select(self, _):
        return self

    def eq(self, name, value):
        self.filters[name] = value
        return self

    def limit(self, _):
        return self

    def insert(self, payload):
        self.payload = payload
        return self

    def execute(self):
        if self.payload is None:
            return SimpleNamespace(data=[r for table, r in self.db.rows if table == self.name
                                         and all(r.get(k) == v for k, v in self.filters.items())])
        row = {**self.payload, "id": str(uuid4())}
        self.db.rows.append((self.name, row))
        if self.db.committed_then_failed:
            self.db.committed_then_failed = False
            raise TimeoutError("Response lost after commit")
        if self.db.race:
            self.db.race = False
            raise APIError({"code": "23505", "message": "Concurrent request committed", "details": None, "hint": None})
        return SimpleNamespace(data=[row])


@pytest.mark.parametrize("table", ["meals", "insulin_events"])
def test_retry_after_lost_response_returns_same_record_without_second_insert(table):
    db = Database()
    db.committed_then_failed = True
    key = uuid4()
    payload = {"user_id": str(uuid4()), "value": "synthetic"}
    with pytest.raises(TimeoutError):
        insert_once(db, table, payload, key)
    saved = insert_once(db, table, payload, key)
    assert len(db.rows) == 1
    assert saved[0]["id"] == db.rows[0][1]["id"]
    assert "creation_request_hash" not in saved[0]


def test_reused_key_rejects_changed_payload_but_is_isolated_by_user():
    db = Database()
    key = uuid4()
    payload = {"user_id": str(uuid4()), "value": "first"}
    first = insert_once(db, "meals", payload, key)
    with pytest.raises(CreationRequestConflict):
        insert_once(db, "meals", {**payload, "value": "changed"}, key)
    second = insert_once(db, "meals", {**payload, "user_id": str(uuid4())}, key)
    assert first[0]["id"] != second[0]["id"]


def test_concurrent_unique_conflict_replays_the_committed_record():
    db = Database()
    db.race = True
    result = insert_once(db, "meals", {"user_id": str(uuid4())}, uuid4())
    assert len(db.rows) == 1
    assert result[0]["id"] == db.rows[0][1]["id"]
