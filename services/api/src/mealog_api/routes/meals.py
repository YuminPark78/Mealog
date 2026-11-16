# Receive requests and return responses; Handle "save this meal."

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from mealog_api.repositories.creation_requests import CreationRequestConflict

from mealog_api.dependencies import get_meals_service
from mealog_api.schemas.meals import (
    MealContextUpdate,
    MealCreate,
    MealRead,
)
from mealog_api.services.meals import MealsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/meals", tags=["Meals"])

MealsServiceDependency = Annotated[
    MealsService,
    Depends(get_meals_service),
]


@router.post("", response_model=MealRead, status_code=status.HTTP_201_CREATED)
def create_meal(
    meal: MealCreate,
    service: MealsServiceDependency,
    idempotency_key: Annotated[UUID | None, Header()] = None,
):
    try:
        return service.create(meal, idempotency_key) if idempotency_key else service.create(meal)
    except CreationRequestConflict:
        raise HTTPException(409, "This submission was already used for a different meal.") from None
    except Exception:
        logger.exception("Failed to save meal")
        raise HTTPException(
            status_code=503,
            detail="Could not save the meal. Please try again.",
        ) from None


@router.get("", response_model=list[MealRead])
def list_meals(
    service: MealsServiceDependency,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    try:
        return service.list_recent(limit)
    except Exception:
        logger.exception("Failed to retrieve meals")
        raise HTTPException(
            status_code=503,
            detail="Could not retrieve meals. Please try again.",
        ) from None


@router.patch("/{meal_id}/context", response_model=MealRead)
def update_meal_context(
    meal_id: UUID,
    changes: MealContextUpdate,
    services: MealsServiceDependency,
):
    try:
        updated = services.update_context(meal_id, changes)
    except Exception:
        logger.exception("Failed to update meal context")
        raise HTTPException(
            status_code=503, detail="Could not update meal details. Please try again."
        ) from None

    if updated is None:
        raise HTTPException(status_code=404, detail="Meal not found.")

    return updated


@router.get("/{meal_id}", response_model=MealRead)
def get_meal(meal_id: UUID, service: MealsServiceDependency):
    try:
        meal = service.get(meal_id)
    except Exception:
        raise HTTPException(503, "Could not retrieve the meal.") from None
    if meal is None:
        raise HTTPException(404, "Meal not found.")
    return meal
