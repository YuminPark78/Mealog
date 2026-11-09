from datetime import UTC
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from mealog_api.dependencies import get_insulin_events_service
from mealog_api.main import app
from mealog_api.schemas.insulin_events import InsulinEventCreate
from mealog_api.services.insulin_events import (
    InsulinEventsService,
    LinkedMealNotFoundError,
)


def payload():
    return {"dose_units": "1.25", "injected_at": "2026-11-09T12:15:00+08:00"}


def test_update_validates_link_before_writing():
    repository = Mock()
    repository.owns_meal.return_value = False
    service = InsulinEventsService(repository)
    with pytest.raises(LinkedMealNotFoundError):
        service.update(uuid4(), InsulinEventCreate(**payload(), meal_id=uuid4()))
    repository.update.assert_not_called()


def test_update_normalizes_occurrence_time():
    repository = Mock()
    event_id = uuid4()
    InsulinEventsService(repository).update(event_id, InsulinEventCreate(**payload()))
    saved_id, event = repository.update.call_args.args
    assert saved_id == event_id
    assert event.injected_at.tzinfo == UTC
    assert event.injected_at.hour == 4


def test_update_missing_or_foreign_event_is_404_and_owner_spoofing_rejected():
    service = Mock()
    service.update.return_value = None
    app.dependency_overrides[get_insulin_events_service] = lambda: service
    try:
        with TestClient(app) as client:
            path = f"/insulin-events/{uuid4()}"
            assert client.put(path, json=payload()).status_code == 404
            assert (
                client.put(
                    path, json={**payload(), "user_id": str(uuid4())}
                ).status_code
                == 422
            )
            assert (
                client.put(path, json={**payload(), "dose_units": "0"}).status_code
                == 422
            )
    finally:
        app.dependency_overrides.clear()


def test_update_requires_login():
    with TestClient(app) as client:
        assert (
            client.put(f"/insulin-events/{uuid4()}", json=payload()).status_code == 401
        )
