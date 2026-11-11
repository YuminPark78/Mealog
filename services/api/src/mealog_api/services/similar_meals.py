import math
import time
import unicodedata
from datetime import UTC, datetime, timedelta
from uuid import UUID

from openai import OpenAI
from pydantic import TypeAdapter

from mealog_api.config import settings
from mealog_api.dependencies import AuthenticatedDatabase
from mealog_api.repositories.glucose import GlucoseRepository
from mealog_api.repositories.meals import MEAL_COLUMNS
from mealog_api.schemas.meals import MealRead
from mealog_api.schemas.similar_meals import (
    ComparisonBasis,
    SimilarMeal,
    SimilarMealsResponse,
)


EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536

# Change this cache version if you change the embedding input format.
CACHE_MODEL = f"{EMBEDDING_MODEL}:dish-name-v1:{EMBEDDING_DIMENSIONS}"

MIN_SIMILARITY = 0.78
MAX_MATCHES = 3
PAGE_SIZE = 250
EMBEDDING_BATCH_SIZE = 64


class MealNotFound(Exception):
    pass


class ComparisonUnavailable(Exception):
    pass


def normalize_dish_name(name: str) -> str:
    normalized = unicodedata.normalize("NFKC", name)
    return " ".join(normalized.casefold().split())


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or len(a) != len(b):
        raise ValueError("Incompatible embedding vectors.")

    norm_a = math.sqrt(sum(value * value for value in a))
    norm_b = math.sqrt(sum(value * value for value in b))

    if norm_a == 0 or norm_b == 0:
        raise ValueError("Zero-length embedding vector.")

    score = sum(x * y for x, y in zip(a, b)) / (norm_a * norm_b)
    return max(-1.0, min(1.0, score))


def consumed_carbohydrates(meal: MealRead) -> float | None:
    if meal.carbohydrates_g is None:
        return None

    if meal.fraction_consumed is None:
        return None

    return meal.carbohydrates_g * meal.fraction_consumed


def reference_amount(meal: MealRead) -> tuple[ComparisonBasis, float | None]:
    if meal.fraction_consumed is None:
        return "planned_serving", meal.carbohydrates_g

    return "consumed", consumed_carbohydrates(meal)


def carbohydrate_tolerance(amount: float) -> float:
    return max(10.0, amount * 0.20)


def valid_embedding(value) -> bool:
    return (
        isinstance(value, list)
        and len(value) == EMBEDDING_DIMENSIONS
        and all(
            isinstance(item, (int, float)) and math.isfinite(item)
            for item in value
        )
        and any(item != 0 for item in value)
    )


def read_pages(build_query, check_deadline) -> list[dict]:
    rows = []
    offset = 0

    while True:
        check_deadline()

        page = (
            build_query()
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
            .data
        )

        rows.extend(page)

        if len(page) < PAGE_SIZE:
            return rows

        offset += PAGE_SIZE


def get_name_embeddings(
    database: AuthenticatedDatabase,
    names: set[str],
    deadline: float,
    check_deadline,
) -> dict[str, list[float]]:
    client = database.client
    owner = str(database.user_id)

    cached_rows = read_pages(
        lambda: (
            client.table("meal_name_embeddings")
            .select("dish_name,embedding")
            .eq("user_id", owner)
            .eq("embedding_model", CACHE_MODEL)
            .order("dish_name")
        ),
        check_deadline,
    )

    embeddings = {
        row["dish_name"]: row["embedding"]
        for row in cached_rows
        if row["dish_name"] in names
        and valid_embedding(row["embedding"])
    }

    missing = sorted(names - embeddings.keys())

    if not missing:
        return embeddings

    if settings.openai_api_key is None:
        raise ComparisonUnavailable(
            "Meal matching is not configured."
        )

    with OpenAI(
        api_key=settings.openai_api_key.get_secret_value(),
        timeout=20.0,
        max_retries=0,
    ) as provider:
        for start in range(0, len(missing), EMBEDDING_BATCH_SIZE):
            check_deadline()

            batch = missing[start:start + EMBEDDING_BATCH_SIZE]
            remaining = max(1.0, min(20.0, deadline - time.monotonic()))

            response = provider.with_options(timeout=remaining).embeddings.create(
                model=EMBEDDING_MODEL,
                dimensions=EMBEDDING_DIMENSIONS,
                encoding_format="float",
                input=[f"Dish name: {name}" for name in batch],
            )

            items = sorted(response.data, key=lambda item: item.index)

            if [item.index for item in items] != list(range(len(batch))):
                raise ComparisonUnavailable(
                    "Meal matching returned an incomplete embedding batch."
                )

            saved_rows = []

            for name, item in zip(batch, items):
                vector = item.embedding

                if not valid_embedding(vector):
                    raise ComparisonUnavailable(
                        "Meal matching returned an invalid embedding."
                    )

                embeddings[name] = vector

                saved_rows.append({
                    "user_id": owner,
                    "embedding_model": CACHE_MODEL,
                    "dish_name": name,
                    "embedding": vector,
                })

            # Each completed batch is cached. If preparation times out,
            # another attempt can continue using these cached vectors.
            client.table("meal_name_embeddings").upsert(
                saved_rows,
                on_conflict="user_id,embedding_model,dish_name",
            ).execute()

    return embeddings


def rank_candidates(
    target: MealRead,
    candidates: list[MealRead],
    embeddings: dict[str, list[float]],
    reference_g: float,
) -> list[tuple[MealRead, bool, float, float, float]]:
    target_name = normalize_dish_name(target.name)
    tolerance = carbohydrate_tolerance(reference_g)
    ranked = []

    for candidate in candidates:
        # A confirmed zero fraction means this meal was not eaten.
        if candidate.fraction_consumed is None:
            continue
        if candidate.fraction_consumed == 0:
            continue

        consumed_g = consumed_carbohydrates(candidate)
        if consumed_g is None:
            continue

        candidate_name = normalize_dish_name(candidate.name)
        exact = candidate_name == target_name

        similarity = (
            1.0
            if exact
            else cosine_similarity(
                embeddings[target_name],
                embeddings[candidate_name],
            )
        )

        # Stage 1: dish relevance.
        if not exact and similarity < MIN_SIMILARITY:
            continue

        # Stage 2: carbohydrate proximity.
        difference = abs(consumed_g - reference_g)
        if difference > tolerance:
            continue

        ranked.append((
            candidate,
            exact,
            similarity,
            consumed_g,
            difference,
        ))

    ranked.sort(
        key=lambda item: (
            not item[1],                  # Exact name first.
            item[4],                      # Smaller carb difference.
            -item[2],                     # Higher cosine similarity.
            -item[0].eaten_at.timestamp(), # More recent tie-breaker.
            str(item[0].id),
        )
    )

    return ranked


def find_similar_meals(
    database: AuthenticatedDatabase,
    meal_id: UUID,
) -> SimilarMealsResponse:
    client = database.client
    owner = str(database.user_id)

    deadline = time.monotonic() + 75.0

    def check_deadline():
        if time.monotonic() >= deadline:
            raise ComparisonUnavailable(
                "Preparing meal comparisons took too long. "
                "Completed embedding batches were cached; try again."
            )

    target_rows = (
        client.table("meals")
        .select(MEAL_COLUMNS)
        .eq("id", str(meal_id))
        .eq("user_id", owner)
        .limit(1)
        .execute()
        .data
    )

    if not target_rows:
        raise MealNotFound

    target = MealRead.model_validate(target_rows[0])
    basis, reference_g = reference_amount(target)

    def result(message, matches=None):
        return SimilarMealsResponse(
            basis=basis,
            reference_carbohydrates_g=reference_g,
            tolerance_g=(
                carbohydrate_tolerance(reference_g)
                if reference_g is not None
                else None
            ),
            message=message,
            matches=matches or [],
        )

    if reference_g is None:
        return result(
            "Record the carbohydrates in your serving to find comparable meals."
        )

    if target.fraction_consumed == 0:
        return result(
            "This meal is recorded as not eaten, so no intake comparison is shown."
        )

    now = datetime.now(UTC)
    before = min(now, target.eaten_at)

    history_rows = read_pages(
        lambda: (
            client.table("meals")
            .select(MEAL_COLUMNS)
            .eq("user_id", owner)
            .neq("id", str(meal_id))
            .lt("eaten_at", before.isoformat())
            .order("eaten_at", desc=True)
            .order("id", desc=True)
        ),
        check_deadline,
    )

    history = TypeAdapter(list[MealRead]).validate_python(history_rows)

    # Only completed historical windows are eligible for this overlay.
    window_rows = read_pages(
        lambda: (
            client.table("meal_glucose_windows")
            .select("meal_id,status")
            .eq("user_id", owner)
            .in_("status", ["ready", "partial"])
            .lte(
                "window_end",
                (now - timedelta(minutes=10)).isoformat(),
            )
            .order("meal_id")
        ),
        check_deadline,
    )

    eligible_ids = {row["meal_id"] for row in window_rows}

    candidates = [
        meal for meal in history
        if str(meal.id) in eligible_ids
        and meal.carbohydrates_g is not None
        and meal.fraction_consumed is not None
        and meal.fraction_consumed > 0
    ]

    if not candidates:
        return result(
            "No earlier meals have both confirmed consumption "
            "and completed glucose collection. "
            "You can update consumption in past meal details."
        )

    names = {
        normalize_dish_name(meal.name)
        for meal in [target, *candidates]
    }

    embeddings = get_name_embeddings(
        database,
        names,
        deadline,
        check_deadline,
    )

    ranked = rank_candidates(
        target,
        candidates,
        embeddings,
        reference_g,
    )

    glucose = GlucoseRepository(client, database.user_id)
    matches = []

    for candidate, exact, similarity, consumed_g, difference in ranked:
        check_deadline()
        snapshot = glucose.snapshot(candidate.id)

        if snapshot is None:
            continue

        # Require at least one usable sample in the displayed interval.
        usable = any(
            not reading.conflict_detected
            and -30 <= (
                reading.measured_at - candidate.eaten_at
            ).total_seconds() / 60 <= 120
            for reading in snapshot.readings
        )

        if not usable:
            continue

        matches.append(SimilarMeal(
            meal=candidate,
            exact_name=exact,
            similarity=similarity,
            consumed_carbohydrates_g=consumed_g,
            carbohydrate_difference_g=difference,
            snapshot=snapshot,
        ))

        if len(matches) == MAX_MATCHES:
            break

    if not matches:
        return result(
            "No close dish-and-carbohydrate matches have usable historical curves."
        )

    return result(
        "Historical observations, aligned to each meal's eating time. "
        "These curves are not predictions for the current meal.",
        matches,
    )