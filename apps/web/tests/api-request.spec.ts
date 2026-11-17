import { expect, test } from "@playwright/test";
import { apiUrl } from "../src/lib/api-url";
import { apiRequest } from "../src/lib/api";
import { waitForApi } from "../src/lib/api-readiness";

const originalFetch = globalThis.fetch;
const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
});

test("a trailing slash cannot break meals, photo analysis, status, or readiness", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = " https://synthetic.example/// ";
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return String(input).endsWith("/health") ? Response.json({ status: "ok", service: "fastapi" }) : Response.json([]);
  };
  await apiRequest("/meals", "synthetic-token");
  await apiRequest("/meal-estimates", "synthetic-token", { method: "POST", body: "{}" });
  await apiRequest("/account/dexcom", "synthetic-token");
  await waitForApi({ signal: new AbortController().signal });
  expect(requests).toEqual(["https://synthetic.example/meals", "https://synthetic.example/meal-estimates", "https://synthetic.example/account/dexcom", "https://synthetic.example/health"]);
});

test("URL joining preserves API prefixes and query parameters", () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8000/api/";
  expect(apiUrl("/insulin-events?meal_id=synthetic")).toBe("http://localhost:8000/api/insulin-events?meal_id=synthetic");
});

test("an empty meal history is a successful empty list", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://synthetic.example/";
  globalThis.fetch = async () => Response.json([]);
  await expect(apiRequest("/meals", "synthetic-token")).resolves.toEqual([]);
});

test("a missing route stays an error with a friendly message", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://synthetic.example/";
  globalThis.fetch = async () => Response.json({ detail: "Not Found" }, { status: 404 });
  await expect(apiRequest("/meals", "synthetic-token")).rejects.toMatchObject({ status: 404, message: "This feature is temporarily unavailable. Please try again shortly." });
});

test("HTML gateway failures never leak parsing errors or markup", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://synthetic.example";
  globalThis.fetch = async () => new Response("<html>Gateway unavailable</html>", { status: 502 });
  await expect(apiRequest("/meal-estimates", "synthetic-token")).rejects.toMatchObject({ status: 502, message: "This feature is temporarily unavailable. Please try again shortly." });
});
