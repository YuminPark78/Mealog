from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI
from mcp.server.transport_security import TransportSecuritySettings

from mealog_api.mcp.server import build_mcp
from mealog_api.mcp.settings import MCPSettings

config = MCPSettings()
server = build_mcp(config) if config.enabled else None

if server is not None:
    url = urlsplit(str(config.public_url))
    http_app = server.streamable_http_app(
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=[url.netloc],
            allowed_origins=[f"{url.scheme}://{url.netloc}", "https://chatgpt.com"],
        ),
    )
else:
    http_app = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    if server is None:
        yield
    else:
        async with server.session_manager.run():
            yield


def mount_mcp(app: FastAPI) -> None:
    if http_app is not None:
        # Add LAST: specific REST/health/docs routes must take precedence.
        # Mount at / because the SDK app already owns its /mcp route AND
        # /.well-known/oauth-protected-resource/mcp discovery route.
        app.mount("/", http_app)