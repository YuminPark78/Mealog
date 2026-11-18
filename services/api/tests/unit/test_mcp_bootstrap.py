from contextlib import asynccontextmanager
import time
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import ValidationError

from mealog_api.mcp.auth import SupabaseTokenVerifier
from mealog_api.mcp.server import build_mcp
from mealog_api.mcp.settings import MCPSettings


def test_enabled_mcp_can_start_without_registered_client():
    config = MCPSettings(
        _env_file=None, enabled=True,
        public_url="https://mealog.example/mcp", allowed_client_ids=[],
    )
    assert config.enabled
    assert config.allowed_client_ids == []


def test_bootstrap_still_validates_public_url():
    with pytest.raises(ValidationError, match="must end in /mcp"):
        MCPSettings(_env_file=None, enabled=True,
                    public_url="https://mealog.example/wrong", allowed_client_ids=[])


def test_empty_allowlist_rejects_token_without_fetching_keys():
    verifier = SupabaseTokenVerifier("https://project.supabase.co", [])

    def unexpected_fetch(_token):
        pytest.fail("Bootstrap rejection must not fetch signing keys")

    verifier.keys = SimpleNamespace(get_signing_key_from_jwt=unexpected_fetch)
    assert verifier._verify("any-token") is None


def test_bootstrap_exposes_discovery_but_blocks_tool_calls():
    config = MCPSettings(_env_file=None, enabled=True,
                         public_url="http://testserver/mcp", allowed_client_ids=[])
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
    app.mount("/", http_app)
    with TestClient(app) as client:
        metadata = client.get("/.well-known/oauth-protected-resource/mcp")
        assert metadata.status_code == 200
        assert metadata.json()["resource"] == "http://testserver/mcp"
        assert metadata.json()["authorization_servers"]
        for authorization in (None, "Bearer untrusted-token"):
            headers = {"Accept": "application/json, text/event-stream"}
            if authorization:
                headers["Authorization"] = authorization
            response = client.post("/mcp", headers=headers, json={
                "jsonrpc": "2.0", "id": 1, "method": "tools/call",
                "params": {"name": "log_meal", "arguments": {
                    "name": "Must not be saved",
                    "eaten_at": "2026-11-18T12:30:00+08:00",
                    "request_id": str(uuid4()),
                }},
            })
            assert response.status_code == 401
            assert "resource_metadata=" in response.headers["www-authenticate"]


def test_configured_client_accepts_only_its_signed_tokens():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    verifier = SupabaseTokenVerifier("https://project.supabase.co", ["registered-client"])
    verifier.keys = SimpleNamespace(
        get_signing_key_from_jwt=lambda _: SimpleNamespace(key=private_key.public_key())
    )
    subject = str(uuid4())
    claims = {
        "iss": verifier.issuer, "aud": "authenticated", "sub": subject,
        "client_id": "registered-client", "role": "authenticated",
        "iat": int(time.time()), "exp": int(time.time()) + 300,
    }
    accepted = verifier._verify(jwt.encode(claims, private_key, algorithm="RS256"))
    assert accepted is not None
    assert accepted.subject == subject
    wrong_client = jwt.encode({**claims, "client_id": "other-client"}, private_key, algorithm="RS256")
    assert verifier._verify(wrong_client) is None
