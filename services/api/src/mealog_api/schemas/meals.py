# Describe and validate information; Require a meal name; reject negative carbohydrates

from typing import Literal, Self
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

ActivityLevel = Literal[
    "mostly_sitting",
    "light_activity",
    "intense_exercise",
    "other_mixed",
]


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


class MealContextUpdate(BaseModel):
    """Optional changes to a meal's follow-up details"""

    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    activity_after: ActivityLevel | None = None

    fraction_consumed: float | None = Field(
        default=None,
        ge=0,
        le=1,
        allow_inf_nan=False,
    )

    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def require_at_least_one_field(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Provide at least one context field.")
        return self


class MealRead(MealCreate):
    """A saved meal belonging to one user."""  # DB generated fields

    id: UUID
    user_id: UUID
    created_at: AwareDatetime

    activity_after: ActivityLevel | None = None
    fraction_consumed: float | None = None
    context_updated_at: AwareDatetime | None = None
