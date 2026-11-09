from uuid import UUID

from pydantic import TypeAdapter
from supabase import Client

from mealog_api.schemas.insulin_events import (
    InsulinEventCreate,
    InsulinEventRead,
)

EVENT_COLUMNS = "id, user_id, meal_id, dose_units, insulin_name, injected_at, notes, created_at, updated_at"


class InsulinEventsRepository:
    def __init__(self, client: Client, user_id: UUID):
        self.client = client
        self.user_id = user_id

    def update(
        self, event_id: UUID, event: InsulinEventCreate
    ) -> InsulinEventRead | None:
        result = (
            self.client.table("insulin_events")
            .update(event.model_dump(mode="json"))
            .eq("id", str(event_id))
            .eq("user_id", str(self.user_id))
            .execute()
        )
        rows = TypeAdapter(list[InsulinEventRead]).validate_python(result.data)
        if not rows:
            return None
        if len(rows) != 1:
            raise RuntimeError("Expected one updated insulin event.")
        return rows[0]

    def owns_meal(self, meal_id: UUID) -> bool:
        result = (
            self.client.table("meals")
            .select("id")
            .eq("id", str(meal_id))
            .eq("user_id", str(self.user_id))
            .limit(1)
            .execute()
        )

        return bool(result.data)

    def create(self, event: InsulinEventCreate) -> InsulinEventRead:
        payload = event.model_dump(mode="json")
        payload["user_id"] = str(self.user_id)

        result = self.client.table("insulin_events").insert(payload).execute()

        rows = TypeAdapter(list[InsulinEventRead]).validate_python(result.data)

        if len(rows) != 1:
            raise RuntimeError("Expected one saved insulin event.")

        return rows[0]

    def list_recent(
        self, limit: int, meal_id: UUID | None = None
    ) -> list[InsulinEventRead]:
        query = (
            self.client.table("insulin_events")
            .select(EVENT_COLUMNS)
            .eq("user_id", str(self.user_id))
        )

        if meal_id is not None:
            query = query.eq("meal_id", str(meal_id))

        result = (
            query.order("injected_at", desc=True)
            .order("id", desc=True)
            .limit(limit)
            .execute()
        )

        return TypeAdapter(list[InsulinEventRead]).validate_python(result.data)
