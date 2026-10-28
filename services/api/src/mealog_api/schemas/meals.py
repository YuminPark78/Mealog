# Describe and validate information; Require a meal name; reject negative carbohydrates

from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


class MealCreate(BaseModel):
    """Information accepted when creating a meal."""

    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    name: str = Field(min_length=1, max_length=200)

    carbohydrates_g: float | None = Field(
        default=None,
        ge=0,
        le=999999.99,
        allow_inf_nan=False,
    )

    eaten_at: AwareDatetime

    notes: str | None = Field(default=None, max_length=2000)


class MealRead(MealCreate):
    """Information returned after a meal has been saved."""  # DB generated fields

    id: UUID
    created_at: AwareDatetime
