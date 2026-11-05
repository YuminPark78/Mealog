from datetime import UTC
from uuid import UUID

from mealog_api.repositories.insulin_events import (
    InsulinEventsRepository,
)
from mealog_api.schemas.insulin_events import (
    InsulinEventCreate,
    InsulinEventRead,
)


class LinkedMealNotFoundError(Exception):
    pass


class InsulinEventsService:
    def __init__(self, repository: InsulinEventsRepository):
        self.repository = repository
    
    def create(self, event: InsulinEventCreate) -> InsulinEventRead:
        if event.meal_id is not None and not self.repository.owns_meal(event.meal_id):
            raise LinkedMealNotFoundError
        
        normalized = event.model_copy(
            update={
                "injected_at": event.injected_at.astimezone(UTC),
            }
        )

        return self.repository.create(normalized)

    def list_recent(self, limit: int, meal_id: UUID | None = None) -> list[InsulinEventRead]:
        if meal_id is not None and not self.repository.owns_meal(meal_id):
            raise LinkedMealNotFoundError

        return self.repository.list_recent(limit, meal_id) 
