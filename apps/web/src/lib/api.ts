import { apiUrl } from "./api-url";

export class ApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
        this.name = "ApiError";
    }
}

export async function apiRequest<T>(
    path: string,
    accessToken: string,
    options: RequestInit = {},
): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);

    if (options.body) {
        headers.set("Content-Type", "application/json");
    }

    const response = await fetch(apiUrl(path), {
        ...options,
        headers,
        cache: "no-store",
        signal: options.signal ?? AbortSignal.timeout(15000),
    });

    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
        const detail = body && typeof body === "object" && "detail" in body && typeof body.detail === "string" ? body.detail : null;
        // A missing endpoint is a service/deployment failure, not an empty account.
        const generic = !detail || ["not found", "method not allowed", "internal server error"].includes(detail.toLowerCase());
        const message = generic
            ? response.status === 401 ? "Please sign in again to continue."
                : "This feature is temporarily unavailable. Please try again shortly."
            : detail;
        throw new ApiError(message, response.status);
    }
    if (body === null && response.status !== 204) {
        throw new ApiError("We couldn’t complete that request. Please try again.", response.status);
    }
    return body as T;
}
