from typing import Any, cast

from cryptography.fernet import Fernet
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
import psycopg
from psycopg.rows import dict_row

from mealog_api.config import ENV_FILE


class CollectorSettings(BaseSettings):
    database_url: SecretStr
    dexcom_encryption_key: SecretStr

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        extra="ignore"
    )


def connect_database() -> psycopg.Connection[dict[str, Any]]:
    settings = CollectorSettings()

    return cast(
        psycopg.Connection[dict[str, Any]],
        psycopg.connect(
            settings.database_url.get_secret_value(),
            row_factory=dict_row,
            connect_timeout=10,
        ),
    )


def credential_cipher() -> Fernet:
    settings = CollectorSettings()

    return Fernet(
        settings.dexcom_encryption_key.get_secret_value().encode()
    )