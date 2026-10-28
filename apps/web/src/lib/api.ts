export async function apiRequest<T>(
    path: string,
    accessToken: string,
    options: RequestInit = {},
): Promise<T> {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

    if (!baseUrl) {
        throw new Error("NEXT_PUBLIC_API_BASE_URL is missing.");
    }

    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);

    if (options.body) {
        headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers,
        cache: "no-store",
        signal: options.signal ?? AbortSignal.timeout(15000),
    });

    const body = await response.json();

    if (!response.ok) {
        const detail =
            typeof body.detail === "string"
                ? body.detail
                : `Request failed: HTTP ${response.status}`;

        throw new Error(detail);
    }

    return body as T;
}