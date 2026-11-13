"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import styles from "./dexcom-connection-card.module.css";

type Status = {
  state: "not_connected" | "disconnected" | "connected" | "needs_attention";
  region: string | null;
  last_check_ok: boolean | null;
  collection_needs_attention: boolean;
};

const titles: Record<Status["state"], string> = {
  not_connected: "Not connected",
  disconnected: "Disconnected",
  connected: "Connected",
  needs_attention: "Connection needs attention",
};

export function DexcomConnectionCard({ accessToken }: { accessToken: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState("");
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [action, setAction] = useState<"connect" | "check" | "disconnect" | null>(null);
  const [showForm, setFormOpen] = useState(false);
  const [formMounted, setFormMounted] = useState(false);
  const [revision, setRevision] = useState(0);
  const formId = useId();
  const busy = action !== null;

  function setShowForm(open: boolean) {
    setFormOpen(open);
    if (open) {
      setFormMounted(true);
    } else if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFormMounted(false);
    }
  }

  useEffect(() => {
    if (busy) return;
    let active = true;
    let running = false;
    let controller: AbortController | undefined;

    async function refresh() {
      if (running || document.hidden) return;
      running = true;
      controller = new AbortController();
      try {
        const result = await apiRequest<Status>("/account/dexcom", accessToken, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        if (!active) return;
        setStatus(result);
        setStatusError("");
      } catch {
        if (active) setStatusError("We couldn’t load your connection status. Please try again.");
      } finally {
        running = false;
      }
    }

    void refresh();
    const interval = setInterval(() => void refresh(), 15_000);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(interval);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [accessToken, busy, revision]);

  async function mutate(kind: "connect" | "check" | "disconnect", body?: object) {
    if (busy) return false;
    setAction(kind);
    setMessage("");
    setActionError("");
    try {
      const result = await apiRequest<Status>(
        kind === "check" ? "/account/dexcom/check" : "/account/dexcom",
        accessToken,
        {
          method: kind === "disconnect" ? "DELETE" : "POST",
          body: body ? JSON.stringify(body) : undefined,
          // The existing Dexcom subprocess can take up to 45 seconds.
          signal: AbortSignal.timeout(70_000),
        },
      );
      setStatus(result);
      setStatusError("");
      if (kind === "check" && result.last_check_ok === false) {
        setActionError("We couldn’t connect to Dexcom. Check that Share is enabled or update your login details.");
      } else {
        setMessage(kind === "disconnect"
          ? "Disconnected. Your stored glucose history has been kept."
          : kind === "check"
            ? "Dexcom connection verified."
            : "Dexcom connected and verified.");
      }
      if (kind === "disconnect") {
        setShowForm(false);
      }
      return true;
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The request failed.");
      return false;
    } finally {
      setAction(null);
      setRevision((value) => value + 1);
    }
  }

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const saved = await mutate("connect", {
      username: String(data.get("username") ?? "").trim(),
      password: String(data.get("password") ?? ""),
      region: String(data.get("region") ?? "ous"),
    });
    // Clear the password after every attempt, including failed requests.
    const password = form.elements.namedItem("password");
    if (password instanceof HTMLInputElement) password.value = "";
    if (saved) {
      form.reset();
      setShowForm(false);
    }
  }

  const enabled = status?.state === "connected" || status?.state === "needs_attention";
  const needsAttention = enabled && (
    status?.state === "needs_attention" || status?.collection_needs_attention
  );
  const title = busy
    ? action === "connect" ? "Connecting…" : action === "check" ? "Checking Dexcom…" : "Disconnecting…"
    : statusError ? "Status unavailable"
      : needsAttention ? "Connection needs attention"
        : status ? titles[status.state] : "Loading connection…";
  const description = busy
    ? "This may take a moment."
    : statusError ? statusError
      : needsAttention ? "We couldn’t retrieve your glucose readings. Try again or update your Dexcom login details."
        : enabled ? "Mealog can collect glucose readings for your meals."
          : status?.state === "disconnected" ? "Reconnect Dexcom to collect readings for new meals. Your previous history is kept."
            : status ? "Connect Dexcom to see glucose history alongside your meals."
              : "Checking whether Dexcom is connected.";

  return (
    <Card className="gap-6 rounded-2xl py-5">
      <CardHeader className="gap-3 px-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <CardTitle>Dexcom Status</CardTitle>
          <p role="status" className="flex items-center gap-2 text-sm font-medium">
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${busy ? "bg-muted-foreground" : statusError || needsAttention ? "bg-amber-500" : enabled ? "bg-emerald-600" : "bg-muted-foreground"}`} />
            {title}
          </p>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-5 sm:px-6">

        {statusError ? (
          <Button type="button" disabled={busy} className="min-h-11" onClick={() => setRevision((value) => value + 1)}>Try again</Button>
        ) : !enabled && status && !showForm ? (
            <Button type="button" disabled={busy} className="min-h-11" aria-expanded={showForm} aria-controls={formId} onClick={() => setShowForm(true)}>Connect Dexcom account</Button>
        ) : null}

        {enabled && (
          <div className="space-y-4 rounded-xl border p-4">
            <h3 className="text-sm font-medium">Manage connection</h3>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy} className="min-h-11 bg-background px-3 shadow-none" aria-expanded={showForm} aria-controls={formId} onClick={() => setShowForm(!showForm)}>Update login details</Button>
              <Button type="button" variant="outline" disabled={busy} className="min-h-11 bg-background px-3 shadow-none" onClick={() => void mutate("check")}>{needsAttention ? "Try again" : "Test connection"}</Button>
              <Button type="button" variant="outline" disabled={busy} className="min-h-11 bg-background px-3 shadow-none" onClick={() => {
                if (window.confirm("Disconnect Dexcom? Your previous glucose history will be kept.")) void mutate("disconnect");
              }}>Disconnect</Button>
            </div>
          </div>
        )}

          <div
            className={styles.reveal}
            data-open={showForm}
            aria-hidden={!showForm}
            inert={!showForm}
            style={{ marginBlock: 0 }}
            onTransitionEnd={(event) => {
              if (event.target === event.currentTarget && !showForm && event.propertyName === "grid-template-rows") {
                setFormMounted(false);
              }
            }}
          >
            <div className={styles.revealContent}>
              {formMounted && (
              <form id={formId} onSubmit={connect} aria-busy={busy} className="pt-5">
            <FieldGroup>
              <Field><FieldLabel htmlFor="dexcom-username">Dexcom username</FieldLabel><Input id="dexcom-username" name="username" autoComplete="off" maxLength={320} disabled={busy} required /></Field>
              <Field><FieldLabel htmlFor="dexcom-password">Dexcom password</FieldLabel><Input id="dexcom-password" name="password" type="password" autoComplete="off" maxLength={1000} disabled={busy} required /></Field>
              <Field>
                <FieldLabel htmlFor="dexcom-region">Dexcom account region</FieldLabel>
                <select id="dexcom-region" name="region" defaultValue={status?.region ?? "ous"} disabled={busy} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                  <option value="us">United States</option><option value="ous">Outside United States</option><option value="jp">Japan</option>
                </select>
                <FieldDescription>Use the region of your Dexcom account.</FieldDescription>
              </Field>
              <Field>
                <FieldDescription>Use your own Dexcom login, not a follower’s. Share must be enabled. Your login details are encrypted and saved so Mealog can collect readings for your meals.</FieldDescription>
                <Button type="submit" disabled={busy} className="min-h-11">{action === "connect" ? "Connecting…" : "Connect Dexcom"}</Button>
                <Button type="button" variant="outline" disabled={busy} className="min-h-11" onClick={() => setShowForm(false)}>Cancel</Button>
              </Field>
            </FieldGroup>
              </form>
              )}
            </div>
          </div>
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
        {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      </CardContent>
    </Card>
  );
}
