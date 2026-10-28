# Communicate with the database; Insert or retrieve meal records
from uuid import UUID

from pydantic import TypeAdapter
from supabase import Client

from mealog_api.schemas.meals import MealCreate, MealRead

MEAL_COLUMNS = "id, user_id, name, carbohydrates_g, eaten_at, notes, created_at"


class MealsRepository:
    def __init__(self, client: Client, user_id: UUID):
        self.client = client
        self.user_id = user_id

    def create(self, meal: MealCreate) -> MealRead:
        payload = meal.model_dump(mode="json")

        payload["user_id"] = str(self.user_id)

        result = self.client.table("meals").insert(payload).execute()

        rows = TypeAdapter(list[MealRead]).validate_python(result.data)

        if len(rows) != 1:
            raise RuntimeError("Expected one saved meal.")

        return rows[0]

    def list_recent(self, limit: int) -> list[MealRead]:
        result = (
            self.client.table("meals")
            .select(MEAL_COLUMNS)
            .eq("user_id", str(self.user_id))
            .order("eaten_at", desc=True)
            .order("id", desc=True)
            .limit(limit)
            .execute()
        )

        return TypeAdapter(list[MealRead]).validate_python(result.data)
