from collections.abc import Callable

from fastapi import APIRouter, HTTPException
from psycopg.errors import LockNotAvailable

from mealog_api.dependencies import AuthenticatedDatabaseDependency
from mealog_api.schemas.account import ConnectDexcom, DeleteAccount, DexcomStatus
from mealog_api.services import account as service


router = APIRouter(prefix="/account", tags=["Account"])


def guarded(operation: Callable):
    try:
        return operation()
    except HTTPException:
        raise
    except LockNotAvailable:
        raise HTTPException(409, "Another account operation is running. Try again shortly.") from None
    except Exception:
        # Do not expose/log credential-bearing payloads or raw provider errors.
        raise HTTPException(503, "The account service is temporarily unavailable.") from None


@router.get("/dexcom", response_model=DexcomStatus)
def status(database: AuthenticatedDatabaseDependency):
    return guarded(lambda: service.dexcom_status(database.user_id))


@router.post("/dexcom", response_model=DexcomStatus)
def connect(payload: ConnectDexcom, database: AuthenticatedDatabaseDependency):
    return guarded(lambda: service.connect_dexcom(database.user_id, payload))


@router.post("/dexcom/check", response_model=DexcomStatus)
def check(database: AuthenticatedDatabaseDependency):
    return guarded(lambda: service.check_dexcom(database.user_id))


@router.delete("/dexcom", response_model=DexcomStatus)
def disconnect(database: AuthenticatedDatabaseDependency):
    return guarded(lambda: service.disconnect_dexcom(database.user_id))


@router.delete("")
def delete(payload: DeleteAccount, database: AuthenticatedDatabaseDependency):
    # The request never accepts a target user ID.
    return guarded(lambda: service.delete_account(database.user_id))
