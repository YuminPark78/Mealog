# Load settings; Read the Supabase URL from `.env`
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    supabase_url: str
    supabase_publishable_key: str
    supabase_service_role_key: SecretStr | None = Field(
        default=None,
        repr=False,
    )
    
    openai_api_key: SecretStr | None = Field(default=None, repr=False)
    openai_model: str = "gpt-5-mini"
    
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        extra="ignore",
    )

    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ],
    )


settings = Settings()
