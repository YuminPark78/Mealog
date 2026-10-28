"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | undefined;

export function getSupabaseBrowser(): SupabaseClient {
    if (typeof window === "undefined") {
        throw new Error("This client is for browser use only.");
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!url || !key) {
        throw new Error("Missing frontend Supabase configuration.");
    }

    client ??= createClient(url, key);

    return client;
}