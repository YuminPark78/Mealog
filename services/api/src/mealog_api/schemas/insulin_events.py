from decimal import Decimal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


class InsulinEventCreate(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    meal_id: UUID | None = None

    dose_units: Decimal = Field(
        gt=Decimal(0),
        max_digits=8,
        decimal_places=3,
        allow_inf_nan=False,
    )

    insulin_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )

    injected_at: AwareDatetime

    notes: str | None = Field(
        default=None,
        max_length=2000,
    )


class InsulinEventRead(InsulinEventCreate):
    id: UUID
    user_id: UUID
    created_at: AwareDatetime
    updated_at: AwareDatetime | None = None
