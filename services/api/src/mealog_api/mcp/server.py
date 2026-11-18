import logging
from typing import Annotated, Literal
from uuid import UUID

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from mcp.server import MCPServer
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver.exceptions import ToolError
from mcp_types import ToolAnnotations
from pydantic import AwareDatetime, BaseModel, Field
from starlette.concurrency import run_in_threadpool

from mealog_api.config import settings
from mealog_api.dependencies import get_authenticated_database, get_meals_service
from mealog_api.mcp.auth import SupabaseTokenVerifier
from mealog_api.mcp.settings import MCPSettings
from mealog_api.repositories.creation_requests import CreationRequestConflict
from mealog_api.schemas.meals import MealCreate

logger = logging.getLogger(__name__)


class SavedMeal(BaseModel):
    id: UUID
    name: str
    eaten_at: AwareDatetime
    carbohydrates_g: float | None
    fraction_consumed: float | None
    notes: str | None


class LogMealResult(BaseModel):
    status: Literal["saved"] = "saved"
    meal: SavedMeal


def save_meal(token: str, meal: MealCreate, request_id: UUID) -> LogMealResult:
    database = get_authenticated_database(
        HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    )
    service = get_meals_service(database)
    saved = service.create(meal, request_id)
    return LogMealResult(meal=SavedMeal.model_validate(saved.model_dump()))


def build_mcp(config: MCPSettings) -> MCPServer:
    issuer = settings.supabase_url.rstrip("/") + "/auth/v1"
    server = MCPServer(
        "Mealog",
        version="0.1.0",
        instructions=(
            "Log meals only when the user asks. Ask for missing eating time or timezone. "
            "Do not invent carbohydrate values. Generate a UUID request_id once per new "
            "meal submission; reuse it AND the identical meal arguments for retries. "
            "Only report a saved meal after log_meal succeeds."
        ),
        token_verifier=SupabaseTokenVerifier(
            settings.supabase_url, config.allowed_client_ids
        ),
        auth=AuthSettings(
            issuer_url=issuer,
            resource_server_url=str(config.public_url),
            required_scopes=[],
            # Supabase uses its own audience identifier. Our verifier checks
            # that audience plus the specific registered OAuth client ID.
            validate_token_resource=False,
        ),
    )

    @server.tool(
        name="log_meal",
        description=(
            "Save one meal to the signed-in user's Mealog account. Use only when "
            "the user asks to log a meal. Ask for missing time/timezone; send an "
            "ISO 8601 timestamp with offset. Leave unknown carbs null. Generate "
            "a UUID request_id for each new submission and reuse the same UUID "
            "and identical arguments on retries. This tool cannot edit a meal."
        ),
        annotations=ToolAnnotations(
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
        meta={"securitySchemes": [{"type": "oauth2", "scopes": []}]},
    )
    async def log_meal(
        name: Annotated[str, Field(min_length=1, max_length=200)],
        eaten_at: Annotated[AwareDatetime, Field(description="Eating time, including UTC offset.")],
        request_id: Annotated[UUID, Field(description="Stable UUID for this submission and retries.")],
        carbohydrates_g: Annotated[float | None, Field(ge=0, le=999999.99, allow_inf_nan=False)] = None,
        fraction_consumed: Annotated[float | None, Field(ge=0, le=1, allow_inf_nan=False)] = None,
        notes: Annotated[str | None, Field(max_length=2000)] = None,
    ) -> LogMealResult:
        access = get_access_token()
        if access is None:
            raise ToolError("Connect your Mealog account before logging a meal.")
        meal = MealCreate(
            name=name,
            eaten_at=eaten_at,
            carbohydrates_g=carbohydrates_g,
            fraction_consumed=fraction_consumed,
            notes=notes,
        )
        try:
            return await run_in_threadpool(save_meal, access.token, meal, request_id)
        except CreationRequestConflict:
            raise ToolError(
                "That request_id was used with different meal details. Do not "
                "automatically create a new ID; confirm whether this is another meal."
            ) from None
        except HTTPException as error:
            if error.status_code == 401:
                raise ToolError("Your Mealog login expired. Reconnect your account.") from None
            raise ToolError("Mealog authentication is temporarily unavailable. Retry later.") from None
        except Exception as error:
            logger.warning("MCP meal save failed: %s", type(error).__name__)
            raise ToolError(
                "The save could not be confirmed. Retry with the SAME request_id "
                "and identical arguments to avoid a duplicate."
            ) from None

    return server