import json
import subprocess
import sys

from mealog_api.schemas.glucose import SourceBatch


class DexcomFetchError(Exception):
    pass


def fetch_recent(credentials: dict) -> SourceBatch:
    try:
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "mealog_api.integrations.dexcom_child",
            ],
            input=json.dumps(credentials),
            capture_output=True,
            text=True,
            timeout=45,
            check=True,
        )

        return SourceBatch.model_validate_json(result.stdout)

    except Exception:
        raise DexcomFetchError(
            "Dexcom retrieval failed."
        ) from None