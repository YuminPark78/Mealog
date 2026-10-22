import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, TypeAdapter
from supabase import create_client

from mealog_api.config import settings


class ConnectionCheck(BaseModel):
    id: int
    message: str


logger = logging.getLogger(__name__)

app = FastAPI(title="Mealog API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "fastapi"}


@app.get("/health/database")
def database_health():
    try:
        client = create_client(
            settings.supabase_url,
            settings.supabase_publishable_key,
        )

        result = (
            client.table("connection_checks").select("id,message").eq("id", 1).execute()
        )

        rows = TypeAdapter(list[ConnectionCheck]).validate_python(result.data)

        if not rows:
            raise HTTPException(
                status_code=503,
                detail="Connection-check record was not returned.",
            )

        return {
            "status": "ok",
            "service": "fastapi",
            "message": rows[0].message,
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("Supabase connection check failed")
        raise HTTPException(
            status_code=503,
            detail="Database check failed. See the backend terminal.",
        ) from None
