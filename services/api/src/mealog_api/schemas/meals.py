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

    fraction_consumed: float | None = Field(
        default=None,
        ge=0,
        le=1,
        allow_inf_nan=False,
    )

    eaten_at: AwareDatetime

    notes: str | None = Field(default=None, max_length=2000)

    notes_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def note_time_requires_note(self) -> Self:
        if self.notes_at is not None and not self.notes:
            raise ValueError("A note occurrence time requires note text.")
        return self


class MealContextUpdate(BaseModel):
    """Optional changes to a meal's follow-up details"""

    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    activity_after: ActivityLevel | None = None

    activity_at: AwareDatetime | None = None

    fraction_consumed: float | None = Field(
        default=None,
        ge=0,
        le=1,
        allow_inf_nan=False,
    )

    notes: str | None = Field(default=None, max_length=2000)

    notes_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def require_at_least_one_field(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Provide at least one context field.")
        for value_field, time_field in (
            ("activity_after", "activity_at"),
            ("notes", "notes_at"),
        ):
            if self.model_fields_set.intersection({value_field, time_field}):
                if not {value_field, time_field} <= self.model_fields_set:
                    raise ValueError(
                        f"Provide {value_field} and {time_field} together."
                    )
                value = getattr(self, value_field)
                timestamp = getattr(self, time_field)
                if (value is None or value == "") != (timestamp is None):
                    raise ValueError(
                        f"Set or clear {value_field} and {time_field} together."
                    )
        return self


class MealRead(MealCreate):
    """A saved meal belonging to one user."""  # DB generated fields

    id: UUID
    user_id: UUID
    created_at: AwareDatetime

    activity_after: ActivityLevel | None = None
    activity_at: AwareDatetime | None = None
    context_updated_at: AwareDatetime | None = None
