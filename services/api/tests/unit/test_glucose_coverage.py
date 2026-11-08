from datetime import UTC, datetime, timedelta

from mealog_api.schemas.glucose import assess_coverage


START = datetime(2026, 11, 7, 10, 0, tzinfo=UTC)
END = START + timedelta(hours=4)


def complete_times():
    return [
        START + timedelta(minutes=minute)
        for minute in range(0, 241, 5)
    ]


def test_future_window_remains_pending():
    assert assess_coverage(
        START,
        END,
        complete_times(),
        END - timedelta(hours=1),
    ) == "pending"


def test_finished_window_with_good_coverage_is_ready():
    assert assess_coverage(
        START,
        END,
        complete_times(),
        END + timedelta(minutes=15),
    ) == "ready"


def test_empty_finished_window_is_partial():
    assert assess_coverage(
        START,
        END,
        [],
        END + timedelta(minutes=15),
    ) == "partial"


def test_internal_gap_is_partial():
    times = [
        timestamp
        for timestamp in complete_times()
        if not (
            START + timedelta(hours=1)
            <= timestamp
            <= START + timedelta(hours=2)
        )
    ]

    assert assess_coverage(
        START,
        END,
        times,
        END + timedelta(minutes=15),
    ) == "partial"


def test_missing_beginning_is_partial():
    assert assess_coverage(
        START,
        END,
        complete_times()[6:],
        END + timedelta(minutes=15),
    ) == "partial"