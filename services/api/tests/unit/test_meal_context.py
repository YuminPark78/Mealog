import pytest
from pydantic import ValidationError

from mealog_api.schemas.meals import MealContextUpdate


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"fraction_consumed": -0.1},
        {"fraction_consumed": 1.1},
        {"activity_before": "unrecognised"},
        {"user_id": "someone-else"},
        {"notes": "x" * 2001},
    ],
)
def test_invalid_context_is_rejected(payload):
    with pytest.raises(ValidationError):
        MealContextUpdate.model_validate(payload)


def test_partial_update_preserves_omitted_fields():
    changes = MealContextUpdate(fraction_consumed=0.5)

    assert changes.model_dump(exclude_unset=True) == {
        "fraction_consumed": 0.5,
    }


def test_explicit_null_clears_a_field():
    changes = MealContextUpdate(activity_after=None)

    assert changes.model_dump(exclude_unset=True) == {
        "activity_after": None,
    }


def test_zero_consumption_is_preserved():
    changes = MealContextUpdate(fraction_consumed=0)

    assert changes.fraction_consumed == 0
