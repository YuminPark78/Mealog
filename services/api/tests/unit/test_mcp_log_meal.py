import time
from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from mcp.server.auth.provider import AccessToken
from mcp.server.transport_security import TransportSecuritySettings

from mealog_api.mcp.auth import SupabaseTokenVerifier
from mealog_api.mcp.server import LogMealResult, SavedMeal, build_mcp
from mealog_api.mcp.settings import MCPSettings
from mealog_api.repositories.creation_requests import CreationRequestConflict
from mealog_api.schemas.meals import MealCreate

CLIENT_ID = "prototype-client"
USER_ID = str(uuid4())


@pytest.fixture
def signed_tokens(monkeypatch):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    verifier = SupabaseTokenVerifier("https://project.supabase.co", [CLIENT_ID])
    monkeypatch.setattr(
        verifier.keys,
        "get_signing_key_from_jwt",
        lambda _: SimpleNamespace(key=private_key.public_key()),
    )
    claims = {
        "iss": verifier.issuer, "aud": "authenticated", "sub": USER_ID,
        "client_id": CLIENT_ID, "role": "authenticated", "iat": int(time.time()),
        "exp": int(time.time()) + 300,
    }
    return verifier, lambda **changes: jwt.encode({**claims, **changes}, private_key, algorithm="RS256")


def test_valid_oauth_token_is_bound_to_user(signed_tokens):
    verifier, sign = signed_tokens
    result = verifier._verify(sign())
    assert result.subject == USER_ID
    assert result.client_id == CLIENT_ID


@pytest.mark.parametrize("changes", [
    {"aud": "another-api"}, {"iss": "https://another-issuer"},
    {"client_id": "another-client"}, {"client_id": None},
    {"exp": 1}, {"sub": "not-a-uuid"}, {"role": "service_role"},
])
def test_invalid_oauth_claims_are_rejected(signed_tokens, changes):
    verifier, sign = signed_tokens
    assert verifier._verify(sign(**changes)) is None


def test_forged_token_is_rejected(signed_tokens):
    verifier, _ = signed_tokens
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    forged = jwt.encode({"sub": USER_ID}, other_key, algorithm="RS256")
    assert verifier._verify(forged) is None


class TestVerifier:
    async def verify_token(self, token):
        if token != "valid-test-token":
            return None
        return AccessToken(token=token, client_id=CLIENT_ID, scopes=[], subject=USER_ID)


@pytest.fixture
def protocol_client(monkeypatch):
    import mealog_api.mcp.server as module
    monkeypatch.setattr(module, "SupabaseTokenVerifier", lambda *_: TestVerifier())
    config = MCPSettings(enabled=True, public_url="http://testserver/mcp", allowed_client_ids=[CLIENT_ID])
    server = build_mcp(config)
    http_app = server.streamable_http_app(
        stateless_http=True, json_response=True,
        transport_security=TransportSecuritySettings(allowed_hosts=["testserver"]),
    )

    @asynccontextmanager
    async def lifespan(app):
        async with server.session_manager.run():
            yield

    app = FastAPI(lifespan=lifespan)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    app.mount("/", http_app)
    with TestClient(app) as client:
        yield client


def rpc(client, method, params=None, authenticated=True):
    headers = {"Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18"}
    if authenticated:
        headers["Authorization"] = "Bearer valid-test-token"
    return client.post("/mcp", headers=headers, json={
        "jsonrpc": "2.0", "id": 1, "method": method, "params": params or {},
    })


def test_discovery_and_authentication(protocol_client):
    client = protocol_client
    assert client.get("/health").json() == {"status": "ok"}
    discovery = client.get("/.well-known/oauth-protected-resource/mcp")
    assert discovery.status_code == 200
    assert discovery.json()["resource"] == "http://testserver/mcp"
    response = rpc(client, "tools/list", authenticated=False)
    assert response.status_code == 401
    assert "resource_metadata=" in response.headers["www-authenticate"]
    handshake = rpc(client, "initialize", {
        "protocolVersion": "2025-06-18", "capabilities": {},
        "clientInfo": {"name": "prototype-test", "version": "1"},
    })
    assert handshake.json()["result"]["serverInfo"]["name"] == "Mealog"
    result = rpc(client, "tools/list").json()["result"]
    assert [tool["name"] for tool in result["tools"]] == ["log_meal"]
    tool = result["tools"][0]
    assert tool["annotations"]["readOnlyHint"] is False
    assert "request_id" in tool["inputSchema"]["required"]
    assert "user_id" not in tool["inputSchema"]["properties"]
    assert "outputSchema" in tool


def arguments():
    return {"name": "Synthetic rice", "eaten_at": "2026-11-18T12:30:00+08:00", "request_id": str(uuid4())}


def test_success_returns_saved_record(protocol_client, monkeypatch):
    import mealog_api.mcp.server as module
    seen = []
    def save(token, meal, request_id):
        seen.append((token, meal, request_id))
        return LogMealResult(meal=SavedMeal(
            id=uuid4(), **meal.model_dump(exclude={"notes_at"})
        ))
    monkeypatch.setattr(module, "save_meal", save)
    params = arguments()
    result = rpc(protocol_client, "tools/call", {"name": "log_meal", "arguments": params}).json()["result"]
    assert result.get("isError") is not True
    assert result["structuredContent"]["status"] == "saved"
    assert seen[0][0] == "valid-test-token"
    assert str(seen[0][2]) == params["request_id"]


@pytest.mark.parametrize("changes", [{"carbohydrates_g": -1}, {"fraction_consumed": 2}, {"eaten_at": "2026-11-18T12:30:00"}])
def test_invalid_meals_never_reach_storage(protocol_client, monkeypatch, changes):
    import mealog_api.mcp.server as module
    def unexpected(*_):
        pytest.fail("Invalid arguments reached storage")
    monkeypatch.setattr(module, "save_meal", unexpected)
    result = rpc(protocol_client, "tools/call", {"name": "log_meal", "arguments": {**arguments(), **changes}}).json()["result"]
    assert result["isError"] is True


@pytest.mark.parametrize("failure", [TimeoutError(), CreationRequestConflict()])
def test_failed_save_never_reports_success(protocol_client, monkeypatch, failure):
    import mealog_api.mcp.server as module
    def fail(*_):
        raise failure
    monkeypatch.setattr(module, "save_meal", fail)
    result = rpc(protocol_client, "tools/call", {"name": "log_meal", "arguments": arguments()}).json()["result"]
    assert result["isError"] is True
    assert "structuredContent" not in result


def test_save_uses_authenticated_identity_and_request_id(monkeypatch):
    import mealog_api.mcp.server as module
    database = object()
    seen = []
    meal = MealCreate(name="Synthetic rice", eaten_at="2026-11-18T12:30:00+08:00")
    request_id = uuid4()
    def authenticate(credentials):
        assert credentials.credentials == "user-token"
        return database
    class Service:
        def create(self, submitted, key):
            seen.append((submitted, key))
            return SimpleNamespace(model_dump=lambda: {"id": uuid4(), **submitted.model_dump()})
    monkeypatch.setattr(module, "get_authenticated_database", authenticate)
    def get_service(authenticated_database):
        assert authenticated_database is database
        return Service()
    monkeypatch.setattr(module, "get_meals_service", get_service)
    assert module.save_meal("user-token", meal, request_id).status == "saved"
    assert seen == [(meal, request_id)]


def test_actual_integration_mounts_discovery_without_hiding_rest(monkeypatch):
    import importlib
    import sys
    monkeypatch.setenv("MEALOG_MCP_ENABLED", "true")
    monkeypatch.setenv("MEALOG_MCP_PUBLIC_URL", "http://testserver/mcp")
    monkeypatch.setenv("MEALOG_MCP_ALLOWED_CLIENT_IDS", '["prototype-client"]')
    sys.modules.pop("mealog_api.mcp.integration", None)
    integration = importlib.import_module("mealog_api.mcp.integration")
    app = FastAPI(lifespan=integration.lifespan)
    @app.get("/health")
    def health():
        return {"status": "ok"}
    integration.mount_mcp(app)
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/.well-known/oauth-protected-resource/mcp").status_code == 200
        assert rpc(client, "tools/list", authenticated=False).status_code == 401
    sys.modules.pop("mealog_api.mcp.integration", None)