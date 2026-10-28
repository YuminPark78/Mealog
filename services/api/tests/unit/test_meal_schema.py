import pytest
from pydantic import ValidationError

from mealog_api.schemas.meals import MealCreate


def valid_payload():
    return {
        "name": "Chicken rice",
        "carbohydrates_g": 65,
        "eaten_at": "2026-10-23T12:30:00+08:00",
    }


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("name", "   "),
        ("carbohydrates_g", -5),
        ("eaten_at", "2026-10-23T12:30:00"),
    ],
)
def test_invalid_meal_is_rejected(field, value):
    payload = valid_payload()
    payload[field] = value

    with pytest.raises(ValidationError):
        MealCreate.model_validate(payload)


def test_unknown_carbohydrates_are_preserved():
    payload = valid_payload()
    payload["carbohydrates_g"] = None

    meal = MealCreate.model_validate(payload)

    assert meal.carbohydrates_g is None
