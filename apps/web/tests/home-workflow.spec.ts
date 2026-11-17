import { expect, test } from "@playwright/test";

test.use({ hasTouch: true, timezoneId: "Asia/Singapore", viewport: { width: 390, height: 844 }, launchOptions: { channel: "chrome" } });
test.skip(!process.env.MEALOG_WEB_URL, "Set MEALOG_WEB_URL against a local frontend.");

test("save once, browse fixed axes, add follow-up, and reopen a saved meal", async ({ page }) => {
  const owner = "11111111-1111-4111-8111-111111111111";
  const user = { id: owner, aud: "authenticated", role: "authenticated", email: "synthetic@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" };
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type,apikey,x-client-info,idempotency-key", "access-control-allow-methods": "GET,POST,PATCH,PUT,OPTIONS" };
  let meal = { id: "22222222-2222-4222-8222-222222222222", user_id: owner, name: "Synthetic lunch", carbohydrates_g: 55, eaten_at: "2026-11-13T04:00:00Z", fraction_consumed: null as number | null, notes: null, notes_at: null, activity_after: null, activity_at: null, context_updated_at: null, created_at: "2026-11-13T04:00:00Z" };
  let postMealCollected = false;
  let glucoseRequests = 0;
  let posts = 0;
  let comparisonRequests = 0;
  const requestKeys: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/auth/v1/**", (route) => route.fulfill({ headers: cors, json: route.request().url().includes("/token") ? { access_token: "synthetic-access-token", refresh_token: "synthetic-refresh-token", token_type: "bearer", expires_in: 3600, user } : user }));
  await page.route("**/insulin-events**", (route) => route.fulfill({ headers: cors, json: [] }));
  await page.route("**/meals**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ headers: cors, status: 204 });
    if (url.pathname.endsWith("/glucose")) {
      glucoseRequests++;
      return route.fulfill({ headers: cors, json: {
        window: { meal_time: meal.eaten_at, status: postMealCollected ? "ready" : "pending", last_error: null },
        readings: Array.from({ length: postMealCollected ? 37 : 13 }, (_, i) => -60 + i * 5).map((minute) => ({ measured_at: new Date(Date.parse(meal.eaten_at) + minute * 60000).toISOString(), glucose_mg_dl: minute === 60 ? 310 : 110 + minute / 6, conflict_detected: false })),
        meals: [], injections: [{ id: "current-insulin", dose_units: "2.5", injected_at: new Date(Date.parse(meal.eaten_at) - 10 * 60000).toISOString() }], activities: [], notes: [],
      } });
    }
    if (request.method() === "POST" && url.pathname === "/meals") {
      posts++; requestKeys.push(request.headers()["idempotency-key"]);
      meal = { ...meal, ...request.postDataJSON() };
      // Model an ambiguous failure after the first insert committed.
      return route.fulfill({ headers: cors, status: posts === 1 ? 503 : 201, json: posts === 1 ? { detail: "Interrupted" } : meal });
    }
    if (url.pathname.endsWith("/similar")) {
      expect(posts).toBe(2); comparisonRequests++;
      if (comparisonRequests === 1) return route.fulfill({ headers: cors, status: 503, json: { detail: "Matching unavailable" } });
      return route.fulfill({ headers: cors, json: { basis: "planned_serving", reference_carbohydrates_g: 55, tolerance_g: 11, message: "Historical observations", matches: [0, 1, 2].map((index) => {
        const old = { ...meal, id: `historical-${index}`, name: `Historical meal ${index + 1}`, eaten_at: "2026-11-10T04:00:00Z", fraction_consumed: 1 };
        return { meal: old, exact_name: false, similarity: 0.9, consumed_carbohydrates_g: 55, carbohydrate_difference_g: 0, snapshot: { window: { meal_time: old.eaten_at, status: "ready", last_error: null }, readings: Array.from({ length: 37 }, (_, i) => -60 + i * 5).map((minute) => ({ measured_at: new Date(Date.parse(old.eaten_at) + minute * 60000).toISOString(), glucose_mg_dl: 90 + index * 35 + minute / 6, conflict_detected: false })), meals: [old], injections: [{ id: `historical-insulin-${index}`, dose_units: String(index + 1), injected_at: new Date(Date.parse(old.eaten_at) - 15 * 60000).toISOString() }], activities: [], notes: [] } };
      }) } });
    }
    if (request.method() === "PATCH") { meal = { ...meal, ...request.postDataJSON() }; return route.fulfill({ headers: cors, json: meal }); }
    if (url.pathname === "/meals") return route.fulfill({ headers: cors, json: [meal] });
    return route.fulfill({ headers: cors, json: meal });
  });
  await page.clock.install();
  await page.goto(`${process.env.MEALOG_WEB_URL}/login`);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await page.getByRole("button", { name: "Enter manually", exact: true }).click();
  await page.getByLabel("Meal name", { exact: true }).fill("Synthetic lunch");
  await page.getByLabel("Carbohydrates in my serving").fill("55");
  await page.getByRole("button", { name: "Save meal & view history", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry save & view history" })).toBeVisible();
  await page.getByRole("button", { name: "Retry save & view history" }).click();
  await expect(page.getByRole("button", { name: "Try comparisons again" })).toBeVisible();
  expect(requestKeys[0]).toBeTruthy(); expect(requestKeys[1]).toBe(requestKeys[0]);
  await page.getByRole("button", { name: "Try comparisons again" }).click();
  await expect(page.getByText("1 of 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log another meal" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "This meal’s glucose" })).toHaveCount(0);
  await expect(page.getByText("2.5 U", { exact: true })).toBeVisible();
  await expect(page.locator(".recharts-wrapper").getByText("-60", { exact: true })).toBeVisible();
  expect((await page.locator(".recharts-wrapper text").allTextContents()).filter((value) => /^-?\d+$/.test(value)).every((value) => Number(value) < 400)).toBe(true);
  await expect(page.getByText("Past observations, not a prediction. Gaps are left unjoined.", { exact: true })).toHaveCount(0);
  const details = page.getByLabel("Historical meal details", { exact: true });
  expect(await details.evaluate((element) => getComputedStyle(element).overflowY)).toBe("hidden");
  const graph = page.locator(".recharts-wrapper");
  const before = await graph.boundingBox();
  const ticks = (await page.locator(".recharts-wrapper text").allTextContents()).filter((value) => /^-?\d+$/.test(value));
  expect(ticks.length).toBeGreaterThan(5);
  await expect(page.getByRole("button", { name: "Next historical meal", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Previous historical meal", exact: true })).toHaveCount(0);
  await page.getByLabel("Glucose graph. Scroll or swipe to browse historical meals.", { exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByText("2 of 3", { exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  expect((await graph.boundingBox())?.y).toBeCloseTo(before!.y, 0);
  expect((await page.locator(".recharts-wrapper text").allTextContents()).filter((value) => /^-?\d+$/.test(value))).toEqual(ticks);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const strokes = await page.locator(".recharts-line-curve").evaluateAll((lines) => Object.fromEntries(lines.map((line) => [line.getAttribute("stroke"), line.getAttribute("stroke-opacity")])));
  expect(strokes).toEqual({ "#3b82f6": "0.18", "#a855f7": "0.9", "#16a085": "0.18", "var(--foreground)": "1" });
  const zeroX = Number(await page.locator(".recharts-reference-line-line").first().getAttribute("x1"));
  const currentRight = await page.locator('[class*="currentLine"] .recharts-line-curve').evaluate((path) => { const box = (path as SVGGraphicsElement).getBBox(); return box.x + box.width; });
  expect(currentRight).toBeLessThanOrEqual(zeroX + 1);
  await expect(page.getByText("2 U", { exact: true })).toBeVisible();
  expect(await page.locator(".recharts-line-curve").nth(1).getAttribute("d")).toContain("L");
  await graph.hover();
  await page.mouse.wheel(0, 500);
  await expect(page.getByText("3 of 3", { exact: true })).toBeVisible();
  expect((await graph.boundingBox())?.y).toBeCloseTo(before!.y, 0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.waitForTimeout(500);
  const touch = await page.context().newCDPSession(page);
  const plotBox = await page.getByLabel("Glucose graph. Scroll or swipe to browse historical meals.", { exact: true }).boundingBox();
  const touchX = plotBox!.x + plotBox!.width / 2;
  const touchY = plotBox!.y + 20;
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: touchX, y: touchY }] });
  for (const offset of [40, 80, 120, 160, 200]) await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: touchX, y: touchY + offset }] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.getByText("2 of 3", { exact: true })).toBeVisible();
  expect((await graph.boundingBox())?.y).toBeCloseTo(before!.y, 0);
  await touch.detach();
  // Model the final collector job completing while this meal is still open.
  const requestsBeforeCollection = glucoseRequests;
  postMealCollected = true;
  await page.clock.fastForward(60_000);
  await expect.poll(() => glucoseRequests).toBeGreaterThan(requestsBeforeCollection);
  await expect.poll(async () => page.locator('[class*="currentLine"] .recharts-line-curve').evaluate((path) => {
    const box = (path as SVGGraphicsElement).getBBox();
    return box.x + box.width;
  })).toBeGreaterThan(zeroX + 20);
  // The last sample is at +120, and the new peak must fit inside the Y axis.
  await expect(page.locator('[class*="currentLine"] .recharts-line-dot')).toHaveCount(37);
  await expect.poll(async () => (await page.locator(".recharts-yAxis .recharts-cartesian-axis-tick-value").allTextContents()).map(Number).some((value) => value >= 310)).toBe(true);
  await expect(page.getByText("This meal · available readings", { exact: true })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/home-comparison-mobile.png" });
  await page.getByRole("button", { name: "Add meal details", exact: true }).click();
  await page.getByRole("button", { name: /Portion eaten/ }).click();
  await page.getByLabel("Amount actually eaten").selectOption("0.5");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Similar meals", exact: true })).toBeVisible();
  expect(meal.fraction_consumed).toBe(0.5); expect(posts).toBe(2);
  await page.getByRole("tab", { name: "Log a meal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Log a meal", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Meals", exact: true }).click();
  await page.getByRole("button", { name: "View history", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Similar meals", exact: true })).toBeVisible();
  expect(posts).toBe(2);
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.getByRole("button", { name: "Add meal details" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await page.getByRole("heading", { name: "Similar meals", exact: true }).boundingBox())!.x).toBeLessThan(320);
  await expect.poll(async () => (await graph.boundingBox())!.width).toBeLessThanOrEqual(288);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(async () => (await graph.boundingBox())!.height).toBeGreaterThan(280);
  await page.screenshot({ path: "test-results/home-comparison-desktop.png" });
  expect(errors).toEqual([]);
});
