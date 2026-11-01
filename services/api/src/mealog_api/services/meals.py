# Perform the feature's steps; Process a meal submission and ask the repository to save it

from datetime import UTC
from uuid import UUID

from mealog_api.repositories.meals import MealsRepository
from mealog_api.schemas.meals import (
    MealContextUpdate,
    MealCreate,
    MealRead,
)


class MealsService:
    def __init__(self, repository: MealsRepository):
        self.repository = repository

    def create(self, meal: MealCreate) -> MealRead:
        normalized_meal = meal.model_copy(
            update={
                "eaten_at": meal.eaten_at.astimezone(UTC),
            }
        )
        return self.repository.create(normalized_meal)

    def list_recent(self, limit: int) -> list[MealRead]:
        return self.repository.list_recent(limit)

    def update_context(
        self, meal_id: UUID, changes: MealContextUpdate
    ) -> MealRead | None:
        return self.repository.update_context(meal_id, changes)
