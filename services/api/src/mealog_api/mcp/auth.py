import logging
from uuid import UUID

import jwt
from jwt import PyJWKClient
from mcp.server.auth.provider import AccessToken
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)


class SupabaseTokenVerifier:
    def __init__(self, supabase_url: str, allowed_client_ids: list[str]):
        self.issuer = supabase_url.rstrip("/") + "/auth/v1"
        self.allowed_client_ids = set(allowed_client_ids)
        self.keys = PyJWKClient(self.issuer + "/.well-known/jwks.json", timeout=10)

    def _verify(self, token: str) -> AccessToken | None:
        try:
            key = self.keys.get_signing_key_from_jwt(token).key
            claims = jwt.decode(
                token,
                key,
                algorithms=["ES256", "RS256"],
                issuer=self.issuer,
                audience="authenticated",
                options={"require": ["exp", "iat", "iss", "aud", "sub", "client_id"]},
            )
            client_id = claims["client_id"]
            if client_id not in self.allowed_client_ids:
                return None
            if claims.get("role") != "authenticated" or claims.get("is_anonymous") is True:
                return None
            subject = str(UUID(claims["sub"]))
            # The audience AND registered OAuth client identify this integration.
            # Do not label a generic Supabase JWT as bound to an MCP resource URL.
            return AccessToken(
                token=token,
                client_id=client_id,
                scopes=[],
                expires_at=int(claims["exp"]),
                subject=subject,
                claims={"iss": self.issuer},
            )
        except (jwt.PyJWTError, ValueError, TypeError, KeyError):
            return None
        except Exception as error:
            # Never log raw tokens, credentials, or decoded user information.
            logger.warning("MCP token verification unavailable: %s", type(error).__name__)
            return None

    async def verify_token(self, token: str) -> AccessToken | None:
        # JWKS retrieval can do network I/O; keep it off the async event loop.
        return await run_in_threadpool(self._verify, token)