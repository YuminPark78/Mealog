import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, launchOptions: { channel: "chrome" } });
test.skip(!process.env.MEALOG_WEB_URL, "Set MEALOG_WEB_URL against a local frontend.");

test("review photo serving before save and safely retry an insulin follow-up", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "photo@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" };
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type,apikey,x-client-info,idempotency-key", "access-control-allow-methods": "GET,POST,PATCH,PUT,OPTIONS" };
  let mealPosts = 0;
  let insulinPosts = 0;
  const insulinKeys: string[] = [];
  let saved: Record<string, unknown> = {};
  await page.route("**/auth/v1/**", (route) => route.fulfill({ headers: cors, json: route.request().url().includes("/token") ? { access_token: "synthetic-access-token", refresh_token: "synthetic-refresh-token", token_type: "bearer", expires_in: 3600, user } : user }));
  await page.route("**/meal-estimates", (route) => {
    expect(mealPosts).toBe(0);
    return route.fulfill({ headers: cors, json: { status: "estimated", name: "Photo chicken bowl", carbohydrates_g: 100, foods: ["rice", "chicken"], assumptions: [], message: "Review your estimate." } });
  });
  await page.route("**/meals**", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ headers: cors, status: 204 });
    if (route.request().url().endsWith("/glucose")) return route.fulfill({ headers: cors, json: { window: { meal_time: saved.eaten_at, status: "awaiting_connection", last_error: null }, readings: [], meals: [], injections: [], activities: [], notes: [] } });
    if (route.request().url().endsWith("/similar")) return route.fulfill({ headers: cors, json: { basis: "planned_serving", reference_carbohydrates_g: 48, tolerance_g: 10, matches: [], message: "No matches" } });
    mealPosts++;
    saved = { ...route.request().postDataJSON(), id: "22222222-2222-4222-8222-222222222222", user_id: user.id, created_at: new Date().toISOString(), activity_after: null, activity_at: null, notes_at: null, context_updated_at: null };
    return route.fulfill({ headers: cors, status: 201, json: saved });
  });
  await page.route("**/insulin-events**", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ headers: cors, status: 204 });
    if (route.request().method() === "GET") return route.fulfill({ headers: cors, json: [] });
    insulinPosts++; insulinKeys.push(route.request().headers()["idempotency-key"]);
    return route.fulfill({ headers: cors, status: insulinPosts === 1 ? 503 : 201, json: insulinPosts === 1 ? { detail: "Response lost" } : { id: "injection", ...route.request().postDataJSON() } });
  });
  await page.goto(`${process.env.MEALOG_WEB_URL}/login`);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Log a meal", exact: true })).toBeVisible();
  await page.locator('input[type="file"]').nth(1).setInputFiles({ name: "meal.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=", "base64") });
  await expect(page.getByLabel("Meal name", { exact: true })).toHaveValue("Photo chicken bowl");
  await page.getByLabel("My share of the pictured food").selectOption("0.5");
  await expect(page.getByLabel("Carbohydrates in my serving")).toHaveValue("50");
  await page.getByLabel("Carbohydrates in my serving").fill("48");
  expect(mealPosts).toBe(0);
  await page.getByRole("button", { name: "Save meal & view history", exact: true }).click();
  await expect(page.getByText("No similar meals yet", { exact: true })).toBeVisible();
  expect(saved.carbohydrates_g).toBe(48); expect(saved.fraction_consumed).toBeNull();
  await page.getByRole("button", { name: "Add meal details", exact: true }).click();
  await page.getByRole("button", { name: "Add insulin entry", exact: true }).click();
  await page.getByLabel("Dose — units").fill("2.5");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry save", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Similar meals", exact: true })).toBeVisible();
  expect(mealPosts).toBe(1); expect(insulinPosts).toBe(2); expect(insulinKeys[1]).toBe(insulinKeys[0]);
});
