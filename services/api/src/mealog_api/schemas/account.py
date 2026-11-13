from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr


class ConnectDexcom(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, max_length=320)
    password: SecretStr = Field(min_length=1, max_length=1000)
    region: Literal["us", "ous", "jp"]


class DeleteAccount(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmation: Literal["DELETE"]


class DexcomStatus(BaseModel):
    state: Literal["not_connected", "disconnected", "connected", "needs_attention"]
    region: str | None = None
    last_check_at: datetime | None = None
    last_check_ok: bool | None = None
    latest_reading_at: datetime | None = None
    last_collection_attempt_at: datetime | None = None
    collection_needs_attention: bool = False
    pending_jobs: int = 0
