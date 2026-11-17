import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, launchOptions: { channel: "chrome" } });
test.skip(!process.env.MEALOG_WEB_URL, "Set MEALOG_WEB_URL against a local frontend.");
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type,apikey,x-client-info", "access-control-allow-methods": "GET,POST,OPTIONS" };

async function signIn(page: Page, unavailable = false) {
  const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "new-user@example.com", email_confirmed_at: "2026-11-01T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" };
  await page.route("**/auth/v1/**", (route) => route.fulfill({ headers: cors, json: route.request().url().includes("/token") ? { access_token: "synthetic-access-token", refresh_token: "synthetic-refresh-token", token_type: "bearer", expires_in: 3600, user } : user }));
  await page.route("**/health", (route) => route.fulfill({ headers: cors, json: { status: "ok", service: "fastapi" } }));
  await page.route("**/account/dexcom", (route) => route.fulfill({ headers: cors, status: unavailable ? 503 : 200, json: unavailable ? { detail: "Unavailable" } : { state: "not_connected", region: null, last_check_at: null, last_check_ok: null, collection_needs_attention: false } }));
  await page.route("**/meals", (route) => route.fulfill({ headers: cors, status: unavailable ? 404 : 200, json: unavailable ? { detail: "Not Found" } : [] }));
  await page.goto(`${process.env.MEALOG_WEB_URL}/login`);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Log a meal", exact: true })).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

const photo = { name: "meal.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=", "base64") };

test("new users can connect Dexcom, see an inviting empty journal, and review a photo estimate", async ({ page }) => {
  await signIn(page);
  await page.getByRole("tab", { name: "Meals", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your meal story starts here", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page.getByText("Not connected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Connect Dexcom account", exact: true }).click();
  await expect(page.getByLabel("Dexcom username", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("tab", { name: "Log a meal", exact: true }).click();
  await page.route("**/meal-estimates", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ headers: cors, status: 204 });
    expect(new URL(route.request().url()).pathname).toBe("/meal-estimates");
    expect(route.request().postDataJSON().image_base64).toBeTruthy();
    return route.fulfill({ headers: cors, json: { status: "estimated", name: "First meal", carbohydrates_g: 40, foods: ["rice"], assumptions: [], message: "Review this estimate." } });
  });
  await page.locator('input[type="file"]').nth(1).setInputFiles(photo);
  await expect(page.getByLabel("Meal name", { exact: true })).toHaveValue("First meal");
  await expect(page.getByLabel("Carbohydrates in my serving")).toHaveValue("40");
});

test("service failures stay distinct from an empty account and keep manual alternatives usable", async ({ page }) => {
  await signIn(page, true);
  await page.getByRole("tab", { name: "Meals", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your meal journal couldn’t load", exact: true })).toBeVisible();
  await expect(page.getByText("Your meal story starts here", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Not Found", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page.getByText("Connection not checked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Connect Dexcom account", exact: true }).click();
  await expect(page.getByLabel("Dexcom username", { exact: true })).toBeEnabled();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("tab", { name: "Log a meal", exact: true }).click();
  await page.route("**/meal-estimates", (route) => route.fulfill({ headers: cors, status: route.request().method() === "OPTIONS" ? 204 : 404, ...(route.request().method() === "OPTIONS" ? {} : { json: { detail: "Not Found" } }) }));
  await page.locator('input[type="file"]').nth(1).setInputFiles(photo);
  await expect(page.getByRole("tabpanel", { name: "Log a meal", exact: true }).getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.getByRole("tabpanel", { name: "Log a meal", exact: true }).getByRole("alert")).not.toContainText("Not Found");
  await expect(page.getByLabel("Meal name", { exact: true })).toBeEnabled();
});
