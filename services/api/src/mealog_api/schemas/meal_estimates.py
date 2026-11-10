from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


MAX_PHOTO_BYTES = 5 * 1024 * 1024
MAX_BASE64_CHARS = 4 * ((MAX_PHOTO_BYTES + 2) // 3)
MAX_REQUEST_BYTES = 7 * 1024 * 1024


class MealPhotoRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    image_base64: str = Field(
        min_length=1,
        max_length=MAX_BASE64_CHARS,
    )
    context: str = Field(default="", max_length=1000)


class MealPhotoDraft(BaseModel):
    # All fields are required in the model's structured response.
    # Nullable fields must explicitly contain null when unknown.
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    status: Literal["estimated", "needs_context", "not_food"]
    name: str | None = Field(min_length=1, max_length=200)
    carbohydrates_g: float | None = Field(
        ge=0,
        le=999999.99,
        allow_inf_nan=False,
    )
    foods: list[str] = Field(max_length=20)
    assumptions: list[str] = Field(max_length=10)
    message: str = Field(max_length=600)

    @model_validator(mode="after")
    def validate_result(self) -> Self:
        if self.status == "estimated":
            if self.name is None or self.carbohydrates_g is None:
                raise ValueError(
                    "An estimated meal requires a name and carbohydrate value."
                )
        elif self.carbohydrates_g is not None:
            raise ValueError(
                "An unsuccessful estimate must leave carbohydrates unknown."
            )

        return self