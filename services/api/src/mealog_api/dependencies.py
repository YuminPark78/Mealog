import logging
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import (
    AuthApiError,
    AuthRetryableError,
    ClientOptions,
    create_client,
)

from mealog_api.config import settings
from mealog_api.repositories.meals import MealsRepository
from mealog_api.services.meals import MealsService

logger = logging.getLogger(__name__)

bearer = HTTPBearer(auto_error=False)

BearerCredentials = Annotated[
    HTTPAuthorizationCredentials | None,
    Depends(bearer),
]


def get_meals_service(
    credentials: BearerCredentials,
) -> MealsService:
    unauthorized = HTTPException(
        status_code=401,
        detail="Please log in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise unauthorized

    token = credentials.credentials

    client = create_client(
        settings.supabase_url,
        settings.supabase_publishable_key,
        options=ClientOptions(
            persist_session=False,
            auto_refresh_token=False,
        ),
    )
    try:
        response = client.auth.get_user(
            token
        )  # Ask Supabase Auth to validate the token and return the user
    except AuthRetryableError:
        raise HTTPException(
            status_code=503,
            detail="Authentication is temporarily unavailable.",
        ) from None
    except AuthApiError as error:
        if error.status >= 500 or error.status == 429:
            raise HTTPException(
                status_code=503, detail="Authentication is temporarily unavailable."
            ) from None
        raise unauthorized from None
    except Exception:
        logger.exception("Authentication verification failed")
        raise HTTPException(
            status_code=503,
            detail="Authentication is temporarily unavailable.",
        ) from None

    if response is None or response.user is None:
        raise unauthorized

    user_id = UUID(response.user.id)

    client.postgrest.auth(token)  # Attach the token to subsequent db requests

    repository = MealsRepository(client, user_id)
    return MealsService(repository)
