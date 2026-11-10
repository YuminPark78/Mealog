import base64
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import SecretStr

from mealog_api.config import settings
from mealog_api.dependencies import get_authenticated_database
from mealog_api.main import app
from mealog_api.routes import meal_estimates
from mealog_api.schemas.meal_estimates import (
    MAX_REQUEST_BYTES,
    MealPhotoDraft,
)


def encoded_photo() -> str:
    output = BytesIO()
    Image.new("RGB", (20, 20), "white").save(output, format="PNG")
    return base64.b64encode(output.getvalue()).decode("ascii")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(
        settings,
        "openai_api_key",
        SecretStr("test-key-not-used"),
    )

    app.dependency_overrides[get_authenticated_database] = lambda: (
        SimpleNamespace(user_id=uuid4())
    )

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(
            get_authenticated_database,
            None,
        )


def test_returns_draft_without_saving_meal(client, monkeypatch):
    fake = AsyncMock(
        return_value=MealPhotoDraft(
            status="estimated",
            name="Chicken with rice",
            carbohydrates_g=60,
            foods=["rice", "chicken"],
            assumptions=["One pictured serving"],
            message="Review the suggested name and carbohydrates.",
        )
    )
    monkeypatch.setattr(
        meal_estimates,
        "generate_photo_draft",
        fake,
    )

    response = client.post(
        "/meal-estimates",
        json={
            "image_base64": encoded_photo(),
            "context": "One bowl",
        },
    )

    assert response.status_code == 200
    assert response.json()["carbohydrates_g"] == 60
    assert "id" not in response.json()
    assert fake.await_args is not None
    assert fake.await_args.kwargs["context"] == "One bowl"
    assert isinstance(fake.await_args.kwargs["jpeg"], bytes)


def test_invalid_image_does_not_call_provider(client, monkeypatch):
    fake = AsyncMock()
    monkeypatch.setattr(
        meal_estimates,
        "generate_photo_draft",
        fake,
    )

    response = client.post(
        "/meal-estimates",
        json={
            "image_base64": base64.b64encode(b"not an image").decode(),
            "context": "",
        },
    )

    assert response.status_code == 400
    fake.assert_not_awaited()


def test_oversized_request_is_rejected(client):
    response = client.post(
        "/meal-estimates",
        content=b"x" * (MAX_REQUEST_BYTES + 1),
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 413


def test_provider_failure_preserves_manual_fallback(client, monkeypatch):
    from mealog_api.services.meal_estimates import InvalidMealEstimate

    monkeypatch.setattr(
        meal_estimates,
        "generate_photo_draft",
        AsyncMock(side_effect=InvalidMealEstimate("No draft")),
    )

    response = client.post(
        "/meal-estimates",
        json={"image_base64": encoded_photo(), "context": ""},
    )

    assert response.status_code == 502
    assert "manually" in response.json()["detail"]


def test_estimation_requires_login():
    with TestClient(app) as client:
        response = client.post(
            "/meal-estimates",
            json={"image_base64": encoded_photo(), "context": ""},
        )

    assert response.status_code == 401