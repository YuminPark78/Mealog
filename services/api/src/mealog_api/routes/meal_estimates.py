import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request
from openai import OpenAIError
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from mealog_api.config import settings
from mealog_api.dependencies import AuthenticatedDatabaseDependency
from mealog_api.schemas.meal_estimates import (
    MAX_REQUEST_BYTES,
    MealPhotoDraft,
    MealPhotoRequest,
)
from mealog_api.services.meal_estimates import (
    InvalidMealEstimate,
    InvalidMealPhoto,
    generate_photo_draft,
    normalize_photo,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/meal-estimates",
    tags=["Meal estimates"],
)

@router.post("", response_model=MealPhotoDraft)
async def estimate_meal(
    request: Request,
    _database: AuthenticatedDatabaseDependency,
) -> MealPhotoDraft:
    if settings.openai_api_key is None:
        raise HTTPException(
            status_code=503,
            detail="Photo analysis is not configured. Enter the meal manually."
        )
    
    if request.headers.get("content-type", "").split(";")[0] != "application/json":
        raise HTTPException(
            status_code=415,
            detail="Send the photo as JSON."
        )

    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_REQUEST_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Choose a photo smaller than 5 MB."
            )
        body.extend(chunk)
    
    try:
        payload = MealPhotoRequest.model_validate_json(bytes(body))
    except ValidationError:
        raise HTTPException(
            status_code=422,
            detail="Provide a valid photo and context of at most 1000 characters."
        ) from None
    finally:
        body.clear()
    
    try:
        async with asyncio.timeout(90):
            jpeg = await run_in_threadpool(
                normalize_photo,
                payload.image_base64,
            )
            draft = await generate_photo_draft(
                jpeg=jpeg,
                context=payload.context,
            )
    except InvalidMealPhoto as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from None
    except TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Photo analysis timed out. Try again or enter the meal manually.",
        ) from None
    except (OpenAIError, InvalidMealEstimate, ValidationError) as error:
        logger.warning(
            "Meal photo analysis failed %s",
            type(error).__name__,
        )
        raise HTTPException(
            status_code=502,
            detail="The photo could not be analyzed. Try again or enter the meal manually."
        ) from None
    
    return draft
