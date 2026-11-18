"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function ConsentForm({ authorizationId }: { authorizationId: string }) {
    const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
    const [needsLogin, setNeedsLogin] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        let active = true;
        async function load() {
            try {
                if (!authorizationId) throw new Error("Start account linking from ChatGPT.");
                const supabase = getSupabaseBrowser();
                const { data: session, error: sessionError } = await supabase.auth.getSession();
                if (sessionError) throw sessionError;
                if (!active) return;
                if (!session.session) {
                    setNeedsLogin(true);
                    return;
                }
                setNeedsLogin(false);
                const { data, error: detailsError } =
                    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
                if (detailsError) throw detailsError;
                if (!active) return;
                if ("redirect_url" in data) {
                    window.location.assign(data.redirect_url);
                    return;
                }
                const expected = process.env.NEXT_PUBLIC_MEALOG_MCP_CLIENT_ID;
                if (!expected || data.client.id !== expected) {
                    throw new Error("This OAuth client is not enabled for the Mealog prototype.");
                }
                setDetails(data);
            } catch (cause) {
                if (active) setError(cause instanceof Error ? cause.message : "Could not load consent.");
            }
        }
        void load();
        return () => { active = false; };
    }, [authorizationId, reload]);

    async function signIn(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            const { error: loginError } = await getSupabaseBrowser().auth.signInWithPassword({ email, password });
            if (loginError) throw loginError;
            setPassword("");
            setReload((value) => value + 1);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Sign-in failed.");
        } finally {
            setBusy(false);
        }
    }

    async function decide(approve: boolean) {
        setBusy(true);
        setError("");
        try {
            const oauth = getSupabaseBrowser().auth.oauth;
            const options = { skipBrowserRedirect: true };
            const { data, error: decisionError } = approve
                ? await oauth.approveAuthorization(authorizationId, options)
                : await oauth.denyAuthorization(authorizationId, options);
            if (decisionError) throw decisionError;
            window.location.assign(data.redirect_url);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not finish account linking.");
            setBusy(false);
        }
    }

    return (
        <main className="mx-auto max-w-lg space-y-5 px-6 py-16">
            <h1 className="text-2xl font-semibold">Connect Mealog to ChatGPT</h1>
            {error && <p role="alert">{error}</p>}
            {needsLogin ? (
                <form onSubmit={signIn} className="space-y-4">
                    <p>Sign in with your existing Mealog account to continue.</p>
                    <label className="block">Email
                        <input className="block w-full border p-2" type="email" autoComplete="username"
                            required value={email} onChange={(event) => setEmail(event.target.value)} />
                    </label>
                    <label className="block">Password
                        <input className="block w-full border p-2" type="password" autoComplete="current-password"
                            required value={password} onChange={(event) => setPassword(event.target.value)} />
                    </label>
                    <button className="rounded border px-4 py-2" disabled={busy}>Sign in</button>
                </form>
            ) : details ? (
                <section className="space-y-4">
                    <p>Requesting app: <strong>{details.client.name}</strong></p>
                    <p>Account: {details.user.email}</p>
                    <p>Requested identity scopes: {details.scope || "None"}</p>
                    <p>This prototype exposes a meal-logging tool. The account token also carries
                        your existing database permissions; this prototype does not restrict that
                        token to meal insertion alone. Use a test account while evaluating it.</p>
                    <p>Return address: <code className="break-all">{details.redirect_uri}</code></p>
                    <div className="flex gap-3">
                        <button className="rounded border px-4 py-2" disabled={busy} onClick={() => void decide(true)}>Allow</button>
                        <button className="rounded border px-4 py-2" disabled={busy} onClick={() => void decide(false)}>Deny</button>
                    </div>
                </section>
            ) : !error ? <p role="status">Loading account connection…</p> : null}
        </main>
    );
}