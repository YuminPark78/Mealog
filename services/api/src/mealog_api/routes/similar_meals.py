import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException
from openai import OpenAIError

from mealog_api.dependencies import AuthenticatedDatabaseDependency
from mealog_api.schemas.similar_meals import SimilarMealsResponse
from mealog_api.services.similar_meals import (
    ComparisonUnavailable,
    MealNotFound,
    find_similar_meals,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/meals",
    tags=["Similar meals"],
)


@router.post(
    "/{meal_id}/similar",
    response_model=SimilarMealsResponse,
)
def similar_meals(
    meal_id: UUID,
    database: AuthenticatedDatabaseDependency,
):
    try:
        return find_similar_meals(database, meal_id)

    except MealNotFound:
        raise HTTPException(
            status_code=404,
            detail="Meal not found.",
        ) from None

    except ComparisonUnavailable as error:
        raise HTTPException(
            status_code=503,
            detail=str(error),
        ) from None

    except OpenAIError as error:
        logger.warning(
            "Meal embedding request failed: %s",
            type(error).__name__,
        )
        raise HTTPException(
            status_code=503,
            detail="Meal matching is temporarily unavailable. Try again.",
        ) from None

    except Exception as error:
        logger.warning(
            "Meal comparison failed: %s",
            type(error).__name__,
        )
        raise HTTPException(
            status_code=503,
            detail="Could not load historical meal comparisons.",
        ) from None