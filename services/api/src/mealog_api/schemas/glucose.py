from datetime import datetime, timedelta
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field

from mealog_api.schemas.meals import ActivityLevel


class SourceReading(BaseModel):
    measured_at: AwareDatetime
    glucose_mg_dl: int = Field(ge=0)
    trend: str | None = None


class SourceBatch(BaseModel):
    account_id: str = Field(min_length=1)
    readings: list[SourceReading]


class GlucoseReading(SourceReading):
    conflict_detected: bool = False


class GlucoseWindow(BaseModel):
    meal_id: UUID
    user_id: UUID
    connection_id: UUID | None
    meal_time: AwareDatetime
    window_start: AwareDatetime
    window_end: AwareDatetime
    status: str
    last_attempt_at: AwareDatetime | None
    last_error: str | None


class MealMarker(BaseModel):
    id: UUID
    name: str
    eaten_at: AwareDatetime


class InsulinMarker(BaseModel):
    id: UUID
    dose_units: str
    injected_at: AwareDatetime


class ActivityMarker(BaseModel):
    id: UUID
    name: str
    activity_after: ActivityLevel
    activity_at: AwareDatetime


class NoteMarker(BaseModel):
    id: UUID
    name: str
    notes: str
    notes_at: AwareDatetime


class GlucoseSnapshot(BaseModel):
    window: GlucoseWindow
    readings: list[GlucoseReading]
    meals: list[MealMarker]
    injections: list[InsulinMarker]
    activities: list[ActivityMarker] = Field(default_factory=list)
    notes: list[NoteMarker] = Field(default_factory=list)


def assess_coverage(
    start: datetime,
    end: datetime,
    measured_times: list[datetime],
    now: datetime,
) -> str:
    if now < end + timedelta(minutes=10):
        return "pending"

    points = sorted(
        {timestamp for timestamp in measured_times if start <= timestamp <= end}
    )

    if not points:
        return "partial"

    tolerance = timedelta(minutes=10)

    if points[0] - start > tolerance:
        return "partial"

    if end - points[-1] > tolerance:
        return "partial"

    for previous, current in zip(points, points[1:]):
        if current - previous > tolerance:
            return "partial"

    return "ready"
