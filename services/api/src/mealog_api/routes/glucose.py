import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException

from mealog_api.dependencies import AuthenticatedDatabaseDependency
from mealog_api.repositories.glucose import GlucoseRepository
from mealog_api.schemas.glucose import GlucoseSnapshot


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/meals", tags=["Glucose"])


@router.get("/{meal_id}/glucose", response_model=GlucoseSnapshot)
def get_meal_glucose(
    meal_id: UUID,
    database: AuthenticatedDatabaseDependency,
):
    repository = GlucoseRepository(
        database.client,
        database.user_id,
    )

    try:
        snapshot = repository.snapshot(meal_id)
    except Exception:
        logger.exception("Could not retrieve glucose snapshot")
        raise HTTPException(
            status_code=503,
            detail="Could not retrieve glucose data.",
        ) from None

    if snapshot is None:
        raise HTTPException(
            status_code=404,
            detail="Meal glucose window not found.",
        )

    return snapshot