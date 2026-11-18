import { expect, test } from "@playwright/test";
import { fromLocalDateTime, toLocalDateTime } from "../src/lib/datetime";

test("local inputs include hours and minutes without rounding seconds", () => {
    const original = new Date(2026, 10, 9, 12, 15, 59, 999).toISOString();
    expect(toLocalDateTime(original)).toBe("2026-11-09T12:15");
});

test("missing timestamps produce an empty input", () => {
    expect(toLocalDateTime(null)).toBe("");
});

test("editing a different field preserves the original timestamp precision", () => {
    const original = "2026-11-09T12:15:01.123456+08:00";
    expect(fromLocalDateTime(toLocalDateTime(original), original)).toBe(original);
});

test("new minute-only inputs convert to an absolute ISO timestamp", () => {
    const input = "2026-11-09T12:30";
    expect(fromLocalDateTime(input, null)).toBe(new Date(input).toISOString());
});

test("changing the minute replaces the original seconds and milliseconds", () => {
    const original = new Date(2026, 10, 9, 12, 15, 1, 123).toISOString();
    const input = "2026-11-09T12:30";
    const result = fromLocalDateTime(input, original);
    expect(result).toBe(new Date(2026, 10, 9, 12, 30).toISOString());
});
