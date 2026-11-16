import { expect, test } from "@playwright/test";

test.use({ timezoneId: "Asia/Singapore", viewport: { width: 390, height: 844 }, launchOptions: { channel: "chrome" } });
test.skip(!process.env.MEALOG_WEB_URL, "Set MEALOG_WEB_URL against a local frontend.");

test("manual Dexcom checks wake the service, keep saved status, and never poll", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "dexcom@example.com", email_confirmed_at: "2026-11-01T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" };
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type,apikey,x-client-info", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" };
  let status = { state: "connected", region: "ous", last_check_ok: true, last_check_at: "2026-11-16T08:30:00Z", collection_needs_attention: false };
  let reads = 0; let checks = 0; let healths = 0; let waking = false;
  let wakeReady: (() => void) | undefined;
  let checkReady: (() => void) | undefined;
  const wakeGate = new Promise<void>((resolve) => { wakeReady = resolve; });
  const checkGate = new Promise<void>((resolve) => { checkReady = resolve; });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/auth/v1/**", (route) => route.fulfill({ headers: cors, json: route.request().url().includes("/token") ? { access_token: "synthetic-access-token", refresh_token: "synthetic-refresh-token", token_type: "bearer", expires_in: 3600, user } : user }));
  await page.route("**/health", async (route) => {
    healths++;
    if (waking && healths === 2) return route.fulfill({ headers: { ...cors, "content-type": "text/html" }, body: "Starting service…" });
    if (waking) await wakeGate;
    return route.fulfill({ headers: cors, json: { status: "ok", service: "fastapi" } });
  });
  await page.route("**/account/dexcom**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ headers: cors, status: 204 });
    if (request.method() === "GET") { reads++; return route.fulfill({ headers: cors, json: status }); }
    if (request.method() === "DELETE") {
      status = { ...status, state: "disconnected" };
      return route.fulfill({ headers: cors, json: status });
    }
    if (!request.url().endsWith("/check")) {
      expect(request.postDataJSON()).toEqual({ username: "synthetic-dexcom", password: "synthetic-secret", region: "ous" });
      status = { ...status, state: "connected", last_check_ok: true, last_check_at: "2026-11-16T10:15:00Z" };
      return route.fulfill({ headers: cors, json: status });
    }
    checks++;
    if (checks === 1) {
      await checkGate;
      status = { ...status, last_check_at: "2026-11-16T09:45:00Z" };
      return route.fulfill({ headers: cors, json: status });
    }
    if (checks === 2) return route.fulfill({ headers: cors, status: 503, json: { detail: "The account service is temporarily unavailable." } });
    status = { ...status, state: "needs_attention", last_check_ok: false, last_check_at: "2026-11-16T10:00:00Z" };
    return route.fulfill({ headers: cors, json: status });
  });
  await page.goto(`${process.env.MEALOG_WEB_URL}/login`);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.getByRole("link", { name: "Account", exact: true }).click();
  const card = page.locator('[data-slot="card"]').filter({ has: page.getByText("Dexcom Status", { exact: true }) });
  await expect(card.getByText("Connected", { exact: true })).toBeVisible();
  await expect(card.locator("time")).toHaveAttribute("datetime", status.last_check_at);
  expect(reads).toBe(1); expect(checks).toBe(0);
  waking = true;
  await card.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect(card.getByText("Starting connection service…", { exact: true })).toBeVisible();
  await expect(card.locator(".animate-spin")).toBeVisible();
  await expect(card.getByRole("button", { name: "Test connection", exact: true })).toBeDisabled();
  expect(checks).toBe(0);
  await expect(card.locator("time")).toHaveAttribute("datetime", "2026-11-16T08:30:00Z");
  wakeReady!();
  await expect(card.getByText("Checking Dexcom…", { exact: true })).toBeVisible();
  expect(checks).toBe(1);
  checkReady!();
  await expect(card.getByText("Connected", { exact: true })).toBeVisible();
  await expect(card.locator("time")).toHaveAttribute("datetime", "2026-11-16T09:45:00Z");
  expect(reads).toBe(1); // Action response updates the card directly.
  waking = false;
  await card.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(card.getByText("Connected", { exact: true })).toBeVisible();
  await expect(card.locator("time")).toHaveAttribute("datetime", "2026-11-16T09:45:00Z");
  expect(checks).toBe(2);
  await page.clock.install();
  await page.clock.fastForward(60_000);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(reads).toBe(1); expect(checks).toBe(2); expect(healths).toBe(4);
  await card.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect(card.getByText("Connection needs attention", { exact: true })).toBeVisible();
  await expect(card.locator("time")).toHaveAttribute("datetime", "2026-11-16T10:00:00Z");
  expect(checks).toBe(3); expect(reads).toBe(1);
  await card.getByRole("button", { name: "Update login details", exact: true }).click();
  await card.getByLabel("Dexcom username", { exact: true }).fill("synthetic-dexcom");
  await card.getByLabel("Dexcom password", { exact: true }).fill("synthetic-secret");
  await card.getByRole("button", { name: "Connect Dexcom", exact: true }).click();
  await expect(card.getByText("Connected", { exact: true })).toBeVisible();
  await expect(card.locator("time")).toHaveAttribute("datetime", "2026-11-16T10:15:00Z");
  expect(reads).toBe(1);
  page.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(card.getByText("Disconnected", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Connect Dexcom account", exact: true })).toBeVisible();
  expect(reads).toBe(1); expect(checks).toBe(3);
  expect(errors).toEqual([]);
});
