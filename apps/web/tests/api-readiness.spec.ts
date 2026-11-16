import { expect, test } from "@playwright/test";
import { ApiStartupError, waitForApi } from "../src/lib/api-readiness";

// Readiness must never mistake a platform loading page for our API.
test("wake-up tolerates temporary HTML and accepts only the API health response", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://synthetic.example";
  let requests = 0;
  globalThis.fetch = async (input, options) => {
    expect(String(input)).toBe("https://synthetic.example/health");
    expect(options?.method ?? "GET").toBe("GET");
    requests++;
    return requests === 1 ? new Response("Starting service…", { headers: { "content-type": "text/html" } })
      : Response.json({ status: "ok", service: "fastapi" });
  };
  try {
    await waitForApi({ signal: new AbortController().signal });
    expect(requests).toBe(2);
  } finally { globalThis.fetch = originalFetch; if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL; else process.env.NEXT_PUBLIC_API_BASE_URL = originalUrl; }
});

test("startup has a bounded deadline and stops retrying after cancellation", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://synthetic.example";
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response("Not ready", { status: 503 }); };
  try {
    await expect(waitForApi({ signal: new AbortController().signal, timeoutMs: 20 })).rejects.toBeInstanceOf(ApiStartupError);
    expect(requests).toBe(1);
    const controller = new AbortController(); controller.abort(new Error("Left Account"));
    await expect(waitForApi({ signal: controller.signal })).rejects.toThrow("Left Account");
    expect(requests).toBe(1);
  } finally { globalThis.fetch = originalFetch; if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL; else process.env.NEXT_PUBLIC_API_BASE_URL = originalUrl; }
});

test("a missing health endpoint fails without repeated requests", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://synthetic.example";
  let requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json({ detail: "Not found" }, { status: 404 }); };
  try {
    await expect(waitForApi({ signal: new AbortController().signal })).rejects.toBeInstanceOf(ApiStartupError);
    expect(requests).toBe(1);
  } finally { globalThis.fetch = originalFetch; if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL; else process.env.NEXT_PUBLIC_API_BASE_URL = originalUrl; }
});
