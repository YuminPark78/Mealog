from datetime import UTC, datetime
from getpass import getpass
from importlib.metadata import version

from pydexcom import Dexcom, Region


def main():
    region = Region(input("Account region [us/ous/jp]: ").strip().lower())
    username = input("Publishing account username: ").strip()
    password = getpass("Publishing account password: ")

    print(f"pydexcom version: {version('pydexcom')}")

    client = Dexcom(
        username=username,
        password=password,
        region=region,
    )

    readings = client.get_glucose_readings(
        minutes=1440,
        max_count=288,
    )

    if not readings:
        print("Request succeeded, but no readings were returned.")
        return

    readings = sorted(readings, key=lambda reading: reading.datetime)
    latest = readings[-1]
    measured_at = latest.datetime.astimezone(UTC)
    age_minutes = (datetime.now(UTC) - measured_at).total_seconds() / 60

    print(f"Readings returned: {len(readings)}")
    print(f"Oldest timestamp: {readings[0].datetime.isoformat()}")
    print(f"Latest timestamp (UTC): {measured_at.isoformat()}")
    print(f"Latest reading: {latest.value} mg/dL / {latest.mmol_l} mmol/L")
    print(f"Trend: {latest.trend_arrow}")
    print(f"Reading age: {age_minutes:.1f} minutes")


if __name__ == "__main__":
    main()
