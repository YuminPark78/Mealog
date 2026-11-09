import { expect, test } from "@playwright/test";
import { fromLocalDateTime, toLocalDateTime } from "../src/lib/datetime";

test("editing a different field preserves the original timestamp precision", () => {
    const original = "2026-11-09T12:15:01.123456+08:00";
    expect(fromLocalDateTime(toLocalDateTime(original), original)).toBe(original);
    expect(toLocalDateTime(null)).toBe("");
});

test("changed local inputs convert to an absolute ISO timestamp", () => {
    const input = "2026-11-09T12:30:00.000";
    expect(fromLocalDateTime(input, null)).toBe(new Date(input).toISOString());
});
