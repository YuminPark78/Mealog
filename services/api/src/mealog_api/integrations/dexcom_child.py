import json
import logging
import sys

from pydexcom import Dexcom, Region


def main():
    logging.disable(logging.CRITICAL)

    credentials = json.load(sys.stdin)

    client = Dexcom(
        username=credentials["username"],
        password=credentials["password"],
        region=Region(credentials["region"]),
    )

    readings = client.get_glucose_readings(
        minutes=1440,
        max_count=288,
    )

    result = {
        "account_id": client.account_id,
        "readings": [
            {
                "measured_at": reading.datetime.isoformat(),
                "glucose_mg_dl": reading.value,
                "trend": reading.trend_direction,
            }
            for reading in readings
        ],
    }

    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Do not print account details, response bodies or passwords.
        sys.exit(1)