from uuid import UUID

from pydantic import AwareDatetime, BaseModel, TypeAdapter
from supabase import Client

from mealog_api.schemas.glucose import (
    GlucoseReading,
    GlucoseSnapshot,
    GlucoseWindow,
    InsulinMarker,
    MealMarker,
)


class StoredInsulinMarker(BaseModel):
    id: UUID
    dose_units: float | str
    injected_at: AwareDatetime


class GlucoseRepository:
    def __init__(self, client: Client, user_id: UUID):
        self.client = client
        self.user_id = user_id

    def snapshot(self, meal_id: UUID) -> GlucoseSnapshot | None:
        result = (
            self.client.table("meal_glucose_windows")
            .select("*")
            .eq("meal_id", str(meal_id))
            .eq("user_id", str(self.user_id))
            .execute()
        )

        windows = TypeAdapter(
            list[GlucoseWindow]
        ).validate_python(result.data)

        if not windows:
            return None

        window = windows[0]

        readings = []

        if window.connection_id is not None:
            result = (
                self.client.table("glucose_readings")
                .select(
                    "measured_at,glucose_mg_dl,trend,"
                    "conflict_detected"
                )
                .eq("user_id", str(self.user_id))
                .eq("connection_id", str(window.connection_id))
                .gte("measured_at", window.window_start.isoformat())
                .lte("measured_at", window.window_end.isoformat())
                .order("measured_at")
                .execute()
            )

            readings = TypeAdapter(
                list[GlucoseReading]
            ).validate_python(result.data)

        result = (
            self.client.table("meals")
            .select("id,name,eaten_at")
            .eq("user_id", str(self.user_id))
            .gte("eaten_at", window.window_start.isoformat())
            .lte("eaten_at", window.window_end.isoformat())
            .order("eaten_at")
            .execute()
        )

        meals = TypeAdapter(
            list[MealMarker]
        ).validate_python(result.data)

        result = (
            self.client.table("insulin_events")
            .select("id,dose_units,injected_at")
            .eq("user_id", str(self.user_id))
            .gte("injected_at", window.window_start.isoformat())
            .lte("injected_at", window.window_end.isoformat())
            .order("injected_at")
            .execute()
        )

        # Database numeric values may arrive as numbers.
        stored_injections = TypeAdapter(
            list[StoredInsulinMarker]
        ).validate_python(result.data)

        injections = [
            InsulinMarker(
                id=event.id,
                dose_units=str(event.dose_units),
                injected_at=event.injected_at,
            )
            for event in stored_injections
        ]

        return GlucoseSnapshot(
            window=window,
            readings=readings,
            meals=meals,
            injections=injections,
        )