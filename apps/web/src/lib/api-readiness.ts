/** Wake the API using read-only health requests before sending an account action. */
export async function waitForApi({ signal, timeoutMs = 120_000 }: { signal: AbortSignal; timeoutMs?: number }): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) throw new Error("NEXT_PUBLIC_API_BASE_URL is missing.");
  const deadline = AbortSignal.timeout(timeoutMs);
  const waiting = AbortSignal.any([signal, deadline]);
  let delay = 1_000;
  try {
    while (!waiting.aborted) {
      try {
        const response = await fetch(`${baseUrl}/health`, {
          cache: "no-store",
          signal: AbortSignal.any([waiting, AbortSignal.timeout(15_000)]),
        });
        // A hosting platform may return an HTML loading page during startup.
        if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
          const body: unknown = await response.json();
          if (body && typeof body === "object" && "status" in body && body.status === "ok" && "service" in body && body.service === "fastapi") return;
        }
        if ([401, 403, 404].includes(response.status)) throw new ApiStartupError("The connection service is unavailable. Please try again later.");
      } catch (cause) {
        if (cause instanceof ApiStartupError) throw cause;
        // Retry only the read-only wake-up request, never the account mutation.
        if (waiting.aborted) break;
      }
      await new Promise<void>((resolve, reject) => {
        waiting.throwIfAborted();
        const abort = () => { clearTimeout(timer); reject(waiting.reason); };
        const timer = setTimeout(() => { waiting.removeEventListener("abort", abort); resolve(); }, delay);
        waiting.addEventListener("abort", abort, { once: true });
      });
      delay = Math.min(delay * 2, 8_000);
    }
  } catch (cause) {
    if (!waiting.aborted) throw cause;
  }
  if (signal.aborted) throw signal.reason;
  throw new ApiStartupError("The connection service took too long to start. Your previous connection result has been kept. Please try again.");
}

export class ApiStartupError extends Error {
  constructor(message: string) { super(message); this.name = "ApiStartupError"; }
}
