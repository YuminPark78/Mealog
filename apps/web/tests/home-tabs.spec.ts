import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, launchOptions: { channel: "chrome" } });
test.skip(!process.env.MEALOG_WEB_URL, "Set MEALOG_WEB_URL against a local frontend.");

test("bookmarks retain drafts and give direct access to meal details and insulin", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "tabs@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" };
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type,apikey,x-client-info,idempotency-key", "access-control-allow-methods": "GET,POST,PATCH,PUT,OPTIONS" };
  let meal = { id: "22222222-2222-4222-8222-222222222222", user_id: user.id, name: "Earlier lunch", carbohydrates_g: 55, eaten_at: "2026-11-13T04:00:00Z", fraction_consumed: null as number | null, notes: null, notes_at: null, activity_after: null, activity_at: null, context_updated_at: null, created_at: "2026-11-13T04:00:00Z" };
  let entries: Record<string, unknown>[] = [];
  const keys: string[] = [];
  let puts = 0;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/auth/v1/**", (route) => route.fulfill({ headers: cors, json: route.request().url().includes("/token") ? { access_token: "synthetic-access-token", refresh_token: "synthetic-refresh-token", token_type: "bearer", expires_in: 3600, user } : user }));
  await page.route("**/meals**", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ headers: cors, status: 204 });
    if (route.request().method() === "PATCH") {
      meal = { ...meal, ...route.request().postDataJSON() };
      return route.fulfill({ headers: cors, json: meal });
    }
    expect(route.request().method()).toBe("GET"); // No new meal is needed for follow-up or insulin.
    return route.fulfill({ headers: cors, json: [meal, ...Array.from({ length: 7 }, (_, index) => ({ ...meal, id: `older-${index}`, name: `Older meal ${index + 1}` }))] });
  });
  await page.route("**/insulin-events**", (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ headers: cors, status: 204 });
    if (request.method() === "GET") return route.fulfill({ headers: cors, json: entries });
    if (request.method() === "PUT") {
      puts++; entries = [{ id: "injection", ...request.postDataJSON() }];
      return route.fulfill({ headers: cors, json: entries[0] });
    }
    keys.push(request.headers()["idempotency-key"]);
    entries = [{ id: "injection", ...request.postDataJSON() }];
    return route.fulfill({ headers: cors, status: keys.length === 1 ? 503 : 201, json: keys.length === 1 ? { detail: "Response lost" } : entries[0] });
  });
  await page.goto(`${process.env.MEALOG_WEB_URL}/login`);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Log a meal", exact: true })).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const tabs = page.getByRole("tablist", { name: "Home sections" });
  const log = page.getByRole("tab", { name: "Log a meal", exact: true });
  const meals = page.getByRole("tab", { name: "Meals", exact: true });
  const insulin = page.getByRole("tab", { name: "Insulin", exact: true });
  await expect(log).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => page.evaluate(() => document.querySelector("main")!.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running").length)).toBe(0);
  await page.screenshot({ path: "test-results/home-bookmarks-light.png" });
  await page.getByRole("button", { name: "Enter manually", exact: true }).click();
  await page.getByLabel("Meal name", { exact: true }).fill("Draft to keep");
  await meals.click();
  await expect(page.getByRole("heading", { name: "Recent meals", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add details", exact: true }).first().click();
  await page.getByRole("button", { name: /Portion eaten/ }).click();
  await page.getByLabel("Amount actually eaten").selectOption("0.75");
  await insulin.click();
  await page.getByLabel("Dose — units", { exact: true }).fill("2.5");
  await log.click();
  await expect(page.getByLabel("Meal name", { exact: true })).toHaveValue("Draft to keep");
  page.once("dialog", (dialog) => dialog.dismiss());
  await meals.click();
  await expect(page.getByRole("heading", { name: "Meal details", exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await meals.click();
  await expect(page.getByRole("heading", { name: "Recent meals", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add details", exact: true }).first().click();
  await meals.click();
  await expect(page.getByRole("heading", { name: "Recent meals", exact: true })).toBeVisible();
  const records = page.getByRole("region", { name: "Recent meal records" });
  expect((await records.boundingBox())!.y + (await records.boundingBox())!.height).toBeLessThan((await tabs.boundingBox())!.y - 12);
  await records.locator('[class*="recentList"]').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const lastAction = records.getByRole("button", { name: "Add details", exact: true }).last();
  await expect(lastAction).toBeInViewport();
  expect((await lastAction.boundingBox())!.y + (await lastAction.boundingBox())!.height).toBeLessThan((await records.boundingBox())!.y + (await records.boundingBox())!.height - 8);
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
  await page.screenshot({ path: "test-results/recent-meals-inset.png" });
  await page.getByRole("button", { name: "Add details", exact: true }).first().click();
  await page.getByRole("button", { name: /Portion eaten/ }).click();
  await page.getByLabel("Amount actually eaten").selectOption("0.75");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recent meals", exact: true })).toBeVisible();
  expect(meal.fraction_consumed).toBe(0.75);
  await insulin.click();
  await expect(page.getByLabel("Dose — units", { exact: true })).toHaveValue("2.5");
  await page.getByRole("button", { name: "Save insulin entry", exact: true }).click();
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(page.getByText("Insulin entry saved.", { exact: true })).toBeVisible();
  expect(keys[0]).toBeTruthy(); expect(keys[1]).toBe(keys[0]); expect(entries[0].meal_id).toBeNull();
  await page.getByRole("button", { name: /2.5 units/ }).click();
  await page.getByLabel("Dose — units", { exact: true }).fill("3");
  await page.getByLabel("Link to a meal").selectOption(meal.id);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Insulin entry saved.", { exact: true })).toBeVisible();
  expect(puts).toBe(1); expect(entries[0].meal_id).toBe(meal.id); expect(keys).toHaveLength(2);
  await insulin.focus(); await insulin.press("Home");
  await expect(log).toBeFocused(); await expect(log).toHaveAttribute("aria-selected", "true");
  await log.press("ArrowRight"); await expect(meals).toBeFocused();
  await expect(meals).toHaveAttribute("aria-selected", "true");
  for (const [width, height] of [[320, 568], [390, 844], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    await expect(tabs).toBeInViewport();
    for (const tab of [log, meals, insulin]) await expect(tab).toBeInViewport();
    expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, overflow: document.documentElement.scrollWidth > innerWidth }))).toEqual({ x: 0, y: 0, overflow: false });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.evaluate(() => { document.documentElement.classList.add("dark"); (document.activeElement as HTMLElement)?.blur(); });
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
  await page.screenshot({ path: "test-results/home-bookmarks-dark.png" });
  expect(errors).toEqual([]);
});
