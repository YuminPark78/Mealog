"use client";

import { useState } from "react";

export default function ConnectionCheckPage() {
    const [output, setOutput] = useState("Click to test the connections.");
    const [running, setRunning] = useState(false);

    async function checkConnections() {
        setRunning(true);
        const results: string[] = [];

        try {
            const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

            if (!baseUrl) {
                throw new Error("NEXT_PUBLIC_API_BASE_URL is missing.");
            }

            for (const path of ["/health", "/health/database"]) {
                const response = await fetch(`${baseUrl}${path}`, {
                    cache: "no-store",
                    signal: AbortSignal.timeout(10000),
                });

                const body = await response.json();

                if (!response.ok) {
                    throw new Error(
                        `${path}: HTTP ${response.status} — ${body.detail ?? "Failed"}`
                    );
                }

                results.push(`${path}\n${JSON.stringify(body, null, 2)}`);
            }

            setOutput(results.join("\n\n"));
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unknown error";

            setOutput([...results, `FAILED: ${message}`].join("\n\n"));
        } finally {
            setRunning(false);
        }
    }

    return (
        <main className="mx-auto max-w-2xl space-y-6 p-8">
            <h1 className="text-2xl font-semibold">Connection check</h1>

            <button
                onClick={checkConnections}
                disabled={running}
                className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
            >
                {running ? "Checking…" : "Test connections"}
            </button>

            <pre className="overflow-auto whitespace-pre-wrap rounded border p-4">
                {output}
            </pre>
        </main>
    );
}