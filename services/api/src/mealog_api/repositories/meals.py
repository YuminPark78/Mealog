# Communicate with the database; Insert or retrieve meal records

from pydantic import TypeAdapter
from supabase import Client

from mealog_api.schemas.meals import MealCreate, MealRead

MEAL_COLUMNS = "id, name, carbohydrates_g, eaten_at, notes, created_at"


class MealsRepository:
    def __init__(self, client: Client):
        self.client = client

    def create(self, meal: MealCreate) -> MealRead:
        payload = meal.model_dump(mode="json")

        result = self.client.table("meals").insert(payload).execute()

        rows = TypeAdapter(list[MealRead]).validate_python(result.data)

        if len(rows) != 1:
            raise RuntimeError("Expected one saved meal.")

        return rows[0]

    def list_recent(self, limit: int) -> list[MealRead]:
        result = (
            self.client.table("meals")
            .select(MEAL_COLUMNS)
            .order("eaten_at", desc=True)
            .order("id", desc=True)
            .limit(limit)
            .execute()
        )

        return TypeAdapter(list[MealRead]).validate_python(result.data)
