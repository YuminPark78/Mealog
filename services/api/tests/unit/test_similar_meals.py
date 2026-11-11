from datetime import UTC, datetime
from uuid import uuid4

from mealog_api.schemas.meals import MealRead
from mealog_api.services.similar_meals import (
    carbohydrate_tolerance,
    consumed_carbohydrates,
    cosine_similarity,
    normalize_dish_name,
    rank_candidates,
    reference_amount,
)


def meal(name="pasta", carbs=60, fraction=1):
    return MealRead(
        id=uuid4(),
        user_id=uuid4(),
        name=name,
        carbohydrates_g=carbs,
        fraction_consumed=fraction,
        eaten_at=datetime(2026, 11, 1, tzinfo=UTC),
        created_at=datetime(2026, 11, 1, tzinfo=UTC),
    )


def test_normalized_names():
    assert normalize_dish_name("  Chicken   Rice ") == "chicken rice"


def test_consumed_amount_is_not_full_serving():
    assert consumed_carbohydrates(meal(carbs=120, fraction=0.5)) == 60


def test_unknown_consumption_stays_unknown():
    record = meal(fraction=None)

    assert consumed_carbohydrates(record) is None
    assert reference_amount(record) == ("planned_serving", 60)


def test_cosine_and_tolerance():
    assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == 1
    assert cosine_similarity([1.0, 0.0], [0.0, 1.0]) == 0

    assert carbohydrate_tolerance(60) == 12
    assert carbohydrate_tolerance(20) == 10


def test_dish_filter_precedes_carb_ranking():
    target = meal("pasta", 60, None)

    same_dish = meal("pasta", 65, 1)
    wrong_dish = meal("sushi", 60, 1)
    wrong_amount = meal("pasta", 100, 1)

    vectors = {
        "pasta": [1.0, 0.0],
        "sushi": [0.0, 1.0],
    }

    ranked = rank_candidates(
        target,
        [wrong_dish, wrong_amount, same_dish],
        vectors,
        reference_g=60,
    )

    assert [item[0].id for item in ranked] == [same_dish.id]


def test_unknown_historical_consumption_is_excluded():
    target = meal("pasta", 60, None)
    historical = meal("pasta", 60, None)

    assert rank_candidates(
        target,
        [historical],
        {"pasta": [1.0, 0.0]},
        reference_g=60,
    ) == []