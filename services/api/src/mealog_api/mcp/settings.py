from pydantic import AnyHttpUrl, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from mealog_api.config import ENV_FILE


class MCPSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE, env_prefix="mealog_mcp_", extra="ignore"
    )

    enabled: bool = False
    public_url: AnyHttpUrl = AnyHttpUrl("http://127.0.0.1:8000/mcp")
    allowed_client_ids: list[str] = []

    @model_validator(mode="after")
    def require_client(self):
        if self.enabled and not self.allowed_client_ids:
            raise ValueError("Set MEALOG_MCP_ALLOWED_CLIENT_IDS before enabling MCP.")
        if self.public_url.path != "/mcp" or self.public_url.query or self.public_url.fragment:
            raise ValueError("MCP public URL must end in /mcp with no query or fragment.")
        return self