from typing import Literal

from pydantic import BaseModel

from mealog_api.schemas.glucose import GlucoseSnapshot
from mealog_api.schemas.meals import MealRead

ComparisonBasis = Literal["planned_serving", "consumed"]


class SimilarMeal(BaseModel):
    meal: MealRead

    exact_name: bool
    similarity: float

    consumed_carbohydrates_g: float
    carbohydrate_difference_g: float

    snapshot: GlucoseSnapshot


class SimilarMealsResponse(BaseModel):
    basis: ComparisonBasis
    reference_carbohydrates_g: float | None
    tolerance_g: float | None

    message: str
    matches: list[SimilarMeal]