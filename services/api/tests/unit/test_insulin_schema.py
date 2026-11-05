from decimal import Decimal

import pytest
from pydantic import ValidationError

from mealog_api.schemas.insulin_events import InsulinEventCreate


def valid_payload():
    return {
        "dose_units": "2.5",
        "injected_at": "2026-11-05T12:15:00+08:00",
    }


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("dose_units", "0"),
        ("dose_units", "-1"),
        ("dose_units", "NaN"),
        ("dose_units", "1.2345"),
        ("injected_at", "2026-11-05T12:15:00"),
        ("meal_id", "not-a-uuid"),
        ("user_id", "client-supplied-owner"),
    ],
)
def test_invalid_event_is_rejected(field, value):
    payload = valid_payload()
    payload[field] = value

    with pytest.raises(ValidationError):
        InsulinEventCreate.model_validate(payload)


def test_event_can_be_unlinked():
    event = InsulinEventCreate.model_validate(valid_payload())

    assert event.meal_id is None
    assert event.dose_units == Decimal("2.5")