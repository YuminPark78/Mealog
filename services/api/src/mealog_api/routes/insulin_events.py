import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import PostgrestAPIError

from mealog_api.dependencies import get_insulin_events_service
from mealog_api.schemas.insulin_events import (
    InsulinEventCreate,
    InsulinEventRead,
)
from mealog_api.services.insulin_events import (
    InsulinEventsService,
    LinkedMealNotFoundError,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/insulin-events",
    tags=["Insulin events"],
)

ServiceDependency = Annotated[
    InsulinEventsService,
    Depends(get_insulin_events_service),
]


@router.post(
    "",
    response_model=InsulinEventRead,
    status_code=status.HTTP_201_CREATED,
)
def create_insulin_event(
    event: InsulinEventCreate,
    service: ServiceDependency,
):
    try:
        return service.create(event)
    except LinkedMealNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Linked meal not found.",
        ) from None
    except PostgrestAPIError as error:
        # Handles a meal disappearing between the check and insert.
        if error.code == "23503":
            raise HTTPException(
                status_code=404,
                detail="Linked meal not found.",
            ) from None

        logger.exception("Failed to save insulin event")
        raise HTTPException(
            status_code=503,
            detail="Could not save the insulin event.",
        ) from None
    except Exception:
        logger.exception("Failed to save insulin event")
        raise HTTPException(
            status_code=503,
            detail="Could not save the insulin event.",
        ) from None


@router.get("", response_model=list[InsulinEventRead])
def list_insulin_events(
    service: ServiceDependency,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    meal_id: UUID | None = None,
):
    try:
        return service.list_recent(limit, meal_id)
    except LinkedMealNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Linked meal not found.",
        ) from None
    except Exception:
        logger.exception("Failed to retrieve insulin events")
        raise HTTPException(
            status_code=503,
            detail="Could not retrieve insulin events.",
        ) from None