"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DexcomConnectionCard } from "@/components/account/dexcom-connection-card";

export function AccountSettings() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    async function initialise() {
      try {
        const supabase = getSupabaseBrowser();
        const { data, error } = await supabase.auth.getUser();
        if (!active) return;
        if (error || !data.user) {
          // Discard an expired/deleted user's browser session as well.
          await supabase.auth.signOut({ scope: "local" });
          if (active) router.replace("/login");
          return;
        }
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
          if (!active) return;
          if (!next) router.replace("/login");
          setSession(next);
        });
        unsubscribe = () => subscription.unsubscribe();
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load your account.");
      }
    }
    void initialise();
    return () => { active = false; unsubscribe?.(); };
  }, [router]);

  if (error) return <main className="p-6"><p role="alert">{error}</p><Link href="/login">Back to login</Link></main>;
  if (!session) return <main className="p-6"><p role="status">Checking your session…</p></main>;
  return <AccountDetails key={session.user.id} session={session} />;
}

function AccountDetails({ session }: { session: Session }) {
  const [action, setAction] = useState<"logout" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const user = session.user;
  const providers = [...new Set(user.identities?.map((identity) => identity.provider) ?? [])];
  const busy = action !== null;

  async function logout() {
    if (busy) return;
    setAction("logout"); setError("");
    try {
      const { error } = await getSupabaseBrowser().auth.signOut({ scope: "local" });
      if (error) throw error;
      window.location.replace("/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not log out.");
      setAction(null);
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    const confirmation = String(values.get("confirmation") ?? "");
    if (confirmation !== "DELETE") return;
    setAction("delete"); setError("");
    try {
      await apiRequest<{ deleted: boolean }>("/account", session.access_token, {
        method: "DELETE", body: JSON.stringify({ confirmation }),
        signal: AbortSignal.timeout(70_000),
      });
      // Account removal may already invalidate server-side sessions.
      await getSupabaseBrowser().auth.signOut({ scope: "local" });
      window.location.replace("/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete your account.");
      setAction(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-5 py-8">
      <nav aria-label="Main navigation" className="flex gap-5 text-sm">
        <Link href="/home" className="underline underline-offset-4">Home</Link>
        <Link href="/account" aria-current="page" className="font-semibold">Account</Link>
      </nav>
      <header><h1 className="text-2xl font-semibold">Your account</h1><p className="mt-2 text-sm text-muted-foreground">Manage your details and Dexcom connection.</p></header>

      <Card>
        <CardHeader><CardTitle>Account details</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-muted-foreground">Email</dt><dd className="break-all">{user.email ?? "Not available"}</dd></div>
            <div><dt className="text-muted-foreground">Email status</dt><dd>{user.email_confirmed_at ? "Verified" : "Not verified"}</dd></div>
            <div><dt className="text-muted-foreground">Sign-in methods</dt><dd>{providers.join(", ") || "Not available"}</dd></div>
            <div><dt className="text-muted-foreground">Joined</dt><dd>{new Date(user.created_at).toLocaleDateString()}</dd></div>
          </dl>
          <div className="flex flex-wrap items-center gap-4">
            {providers.includes("email") && <Link href="/forgot-password" className="text-sm underline underline-offset-4">Reset password</Link>}
            <Button type="button" variant="outline" disabled={busy} onClick={() => void logout()}>{action === "logout" ? "Logging out…" : "Log out"}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Unmount polling/credential controls during destructive account actions. */}
      {!busy && <DexcomConnectionCard accessToken={session.access_token} />}

      <Card>
        <CardHeader><CardTitle>Delete account</CardTitle><CardDescription>Delete your Mealog account and its stored meal, insulin, glucose and Dexcom connection records. Your Dexcom account is unaffected.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {!showDelete ? (
            <Button type="button" variant="destructive" disabled={busy} onClick={() => setShowDelete(true)}>Delete account…</Button>
          ) : (
            <form onSubmit={deleteAccount} aria-busy={busy}>
              <FieldGroup>
                <Field><FieldLabel htmlFor="delete-confirmation">Type DELETE to confirm. This cannot be undone.</FieldLabel><Input id="delete-confirmation" name="confirmation" pattern="DELETE" autoComplete="off" disabled={busy} required /></Field>
                <Field><Button type="submit" variant="destructive" disabled={busy}>{action === "delete" ? "Deleting…" : "Permanently delete account"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setShowDelete(false)}>Cancel</Button></Field>
              </FieldGroup>
            </form>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
