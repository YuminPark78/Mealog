import { expect, test } from "@playwright/test";

// Uses synthetic API responses. Opt in against a running local frontend.
test.use({ timezoneId: "Asia/Singapore", launchOptions: { channel: "chrome" } });
test.skip(!process.env.MEALOG_WEB_URL, "Set MEALOG_WEB_URL to run browser checks.");

test("edit insulin, record independent event times, and display the combined timeline", async ({ page }) => {
    page.on("pageerror", (error) => console.error(error.message));
    let showReadings = true;
    const owner = "11111111-1111-4111-8111-111111111111";
    let meal = {
        id: "22222222-2222-4222-8222-222222222222", user_id: owner,
        name: "Synthetic lunch", carbohydrates_g: 40, eaten_at: "2026-11-09T04:00:00Z",
        notes: null as string | null, notes_at: null as string | null,
        activity_after: null as string | null, activity_at: null as string | null,
        fraction_consumed: null, context_updated_at: null,
        created_at: "2026-11-09T04:00:00Z",
    };
    let injection = {
        id: "33333333-3333-4333-8333-333333333333", user_id: owner, meal_id: meal.id,
        dose_units: "2.5", insulin_name: "Synthetic insulin", injected_at: "2026-11-09T03:45:00Z",
        notes: null, created_at: "2026-11-09T03:45:00Z",
    };
    const user = { id: owner, aud: "authenticated", role: "authenticated",
        email: "synthetic@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-11-09T00:00:00Z" };

    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type,apikey,x-client-info", "access-control-allow-methods": "GET,POST,PATCH,PUT,OPTIONS" };
    await page.route("**/auth/v1/**", async (route) => {
        await route.fulfill({ headers: cors, json: route.request().url().includes("/token")
            ? { access_token: "synthetic-access-token", refresh_token: "synthetic-refresh-token", token_type: "bearer", expires_in: 3600, user }
            : user });
    });
    await page.route("**/insulin-events**", async (route) => {
        if (route.request().method() === "OPTIONS") return route.fulfill({ headers: cors, status: 204 });
        if (route.request().method() === "PUT") {
            injection = { ...injection, ...route.request().postDataJSON() };
            return route.fulfill({ headers: cors, json: injection });
        }
        return route.fulfill({ headers: cors, json: [injection] });
    });
    await page.route("**/meals**", async (route) => {
        if (route.request().method() === "OPTIONS") return route.fulfill({ headers: cors, status: 204 });
        if (route.request().method() === "PATCH") {
            meal = { ...meal, ...route.request().postDataJSON() };
            return route.fulfill({ headers: cors, json: meal });
        }
        if (route.request().url().endsWith("/glucose")) {
            return route.fulfill({ headers: cors, json: {
                window: { meal_time: meal.eaten_at, status: "ready", last_error: null },
                readings: showReadings ? [
                    { measured_at: "2026-11-09T03:55:00Z", glucose_mg_dl: 100, conflict_detected: false },
                    { measured_at: "2026-11-09T04:00:00Z", glucose_mg_dl: 105, conflict_detected: false },
                ] : [], meals: [meal], injections: [injection],
                activities: meal.activity_at ? [meal] : [], notes: meal.notes_at ? [meal] : [],
            } });
        }
        return route.fulfill({ headers: cors, json: [meal] });
    });
    await page.goto(`${process.env.MEALOG_WEB_URL}/account`);
    await page.getByLabel("Email", { exact: true }).fill("synthetic@example.com");
    await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page.getByText("Signed in as synthetic@example.com")).toBeVisible();

    await page.getByRole("button", { name: "Edit event", exact: true }).click();
    await expect(page.getByLabel("Administration time", { exact: false })).toHaveValue("2026-11-09T11:45");
    await page.getByLabel("Actual dose", { exact: false }).fill("3.25");
    await page.getByLabel("Administration time", { exact: false }).fill("2026-11-09T11:50");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByText("Insulin event updated.")).toBeVisible();
    expect(injection.dose_units).toBe("3.25");
    expect(injection.injected_at).toBe("2026-11-09T03:50:00.000Z");

    await page.getByText("Add or edit meal details").click();
    await page.getByRole("combobox", { name: "Activity after eating", exact: true }).selectOption("light_activity");
    await page.getByRole("textbox", { name: "Activity time", exact: true }).fill("2026-11-09T12:30");
    await page.getByRole("textbox", { name: "Notes — optional", exact: true }).first().fill("A short walk");
    await page.getByRole("textbox", { name: "Note occurrence time", exact: true }).fill("2026-11-09T12:35");
    await page.getByRole("button", { name: "Save details", exact: true }).click();
    await expect(page.getByText("Meal details saved.")).toBeVisible();
    expect(meal.activity_at).toBe("2026-11-09T04:30:00.000Z");
    expect(meal.notes_at).toBe("2026-11-09T04:35:00.000Z");

    await page.getByRole("button", { name: "Load meal timeline", exact: true }).click();
    const timeline = page.getByRole("list", { name: "Timeline events", exact: true });
    await expect(timeline.getByRole("listitem")).toHaveCount(4);
    const rows = await timeline.getByRole("listitem").allTextContents();
    expect(rows[0]).toContain("Insulin: 3.25 units");
    expect(rows[1]).toContain("Meal: Synthetic lunch");
    expect(rows[2]).toContain("Activity: Walking / light activity");
    expect(rows[3]).toContain("Note: A short walk");
    await expect(page.locator(".recharts-reference-line")).toHaveCount(4);
    await page.screenshot({ path: "test-results/milestones-timeline.png", fullPage: true });

    // Clearing details removes both their value and occurrence time.
    await page.getByRole("combobox", { name: "Activity after eating", exact: true }).selectOption("");
    await page.getByRole("textbox", { name: "Notes — optional", exact: true }).first().fill("");
    await page.getByRole("button", { name: "Save details", exact: true }).click();
    await expect(page.getByText("Meal details saved.")).toBeVisible();
    expect(meal.activity_at).toBeNull();
    expect(meal.notes_at).toBeNull();
    showReadings = false;
    await page.getByRole("button", { name: "Load meal timeline", exact: true }).click();
    await expect(page.getByText("No readings collected for this window yet.")).toBeVisible();
    await expect(timeline.getByRole("listitem")).toHaveCount(2);
    await expect(page.locator(".recharts-reference-line")).toHaveCount(2);
});
