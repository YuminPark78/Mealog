from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

from mealog_api.repositories.glucose import GlucoseRepository


def test_activity_and_notes_use_their_own_times_and_authenticated_owner():
    meal_id, owner = uuid4(), uuid4()
    client = Mock()
    query = client.table.return_value
    for method in ("select", "eq", "gte", "lte", "order"):
        getattr(query, method).return_value = query
    window = dict(
        meal_id=str(meal_id),
        user_id=str(owner),
        connection_id=None,
        meal_time="2026-11-09T04:00:00Z",
        window_start="2026-11-09T02:00:00Z",
        window_end="2026-11-09T06:00:00Z",
        status="awaiting_connection",
        last_attempt_at=None,
        last_error=None,
    )
    activity = dict(
        id=str(uuid4()),
        name="Earlier meal",
        activity_after="light_activity",
        activity_at="2026-11-09T04:30:00Z",
    )
    note = dict(
        id=str(uuid4()),
        name="Earlier meal",
        notes="Felt tired",
        notes_at="2026-11-09T04:45:00Z",
    )
    query.execute.side_effect = [
        SimpleNamespace(data=data) for data in ([window], [], [], [activity], [note])
    ]
    snapshot = GlucoseRepository(client, owner).snapshot(meal_id)
    assert snapshot.readings == []
    assert snapshot.activities[0].activity_at.minute == 30
    assert snapshot.notes[0].notes_at.minute == 45
    assert ("activity_at", window["window_start"].replace("Z", "+00:00")) in [
        call.args for call in query.gte.call_args_list
    ]
    assert ("notes_at", window["window_start"].replace("Z", "+00:00")) in [
        call.args for call in query.gte.call_args_list
    ]
    assert (
        sum(call.args == ("user_id", str(owner)) for call in query.eq.call_args_list)
        == 5
    )
