"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { ApiStartupError, waitForApi } from "@/lib/api-readiness";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import styles from "./dexcom-connection-card.module.css";

type Status = {
  state: "not_connected" | "disconnected" | "connected" | "needs_attention";
  region: string | null;
  last_check_ok: boolean | null;
  last_check_at: string | null;
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
  const [actionError, setActionError] = useState("");
  const [action, setAction] = useState<"connect" | "check" | "disconnect" | null>(null);
  const [showForm, setFormOpen] = useState(false);
  const [formMounted, setFormMounted] = useState(false);
  const [revision, setRevision] = useState(0);
  const [stage, setStage] = useState<"starting" | "checking" | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const statusRequest = useRef<AbortController | null>(null);
  const actionRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const acting = useRef(false);
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
    mounted.current = true;
    return () => { mounted.current = false; statusRequest.current?.abort(); actionRequest.current?.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    statusRequest.current = controller;
    async function loadStatus() {
      setLoadingStatus(true); setStage("starting"); setStatusError("");
      try {
        await waitForApi({ signal: controller.signal });
        if (controller.signal.aborted) return;
        setStage(null);
        const result = await apiRequest<Status>("/account/dexcom", accessToken, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        if (!controller.signal.aborted) setStatus(result);
      } catch (cause) {
        if (!controller.signal.aborted) setStatusError(cause instanceof ApiStartupError ? cause.message : "We couldn’t load your saved connection status. Please try again.");
      } finally {
        if (!controller.signal.aborted) { setLoadingStatus(false); setStage(null); }
      }
    }
    void loadStatus();
    // Load once on entry or explicit retry. Never poll or recheck on tab focus.
    return () => { controller.abort(); if (statusRequest.current === controller) statusRequest.current = null; };
  }, [accessToken, revision]);

  async function mutate(kind: "connect" | "check" | "disconnect", body?: object) {
    if (acting.current || loadingStatus) return false;
    acting.current = true;
    const controller = new AbortController(); actionRequest.current = controller;
    statusRequest.current?.abort();
    setAction(kind); setStage("starting");
    setActionError("");
    try {
      await waitForApi({ signal: controller.signal });
      if (controller.signal.aborted) return false;
      setStage("checking");
      const result = await apiRequest<Status>(
        kind === "check" ? "/account/dexcom/check" : "/account/dexcom",
        accessToken,
        {
          method: kind === "disconnect" ? "DELETE" : "POST",
          body: body ? JSON.stringify(body) : undefined,
          // The existing Dexcom subprocess can take up to 45 seconds.
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(70_000)]),
        },
      );
      if (!mounted.current || controller.signal.aborted) return false;
      setStatus(result);
      setStatusError("");
      if (kind === "check" && result.last_check_ok === false) {
        setActionError("We couldn’t connect to Dexcom. Check that Share is enabled or update your login details.");
      }
      if (kind === "disconnect") {
        setShowForm(false);
      }
      return true;
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) setActionError(
        cause instanceof ApiStartupError || cause instanceof ApiError ? cause.message
          : "The request didn’t complete. Your previous connection result has been kept. Please try again.",
      );
      return false;
    } finally {
      acting.current = false;
      if (actionRequest.current === controller) actionRequest.current = null;
      if (mounted.current) { setAction(null); setStage(null); }
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
  const title = stage === "starting" ? "Starting connection service…" : busy
    ? action === "connect" ? "Connecting…" : action === "check" ? "Checking Dexcom…" : "Disconnecting…"
    : statusError && !status ? "Status unavailable"
      : needsAttention ? "Connection needs attention"
        : status ? titles[status.state] : "Loading connection…";
  const description = stage === "starting"
    ? "Please wait while the service wakes up. This can take about a minute."
    : busy ? "This may take a moment."
    : statusError ? statusError
      : needsAttention ? "We couldn’t retrieve your glucose readings. Try again or update your Dexcom login details."
        : enabled ? "Mealog can collect glucose readings for your meals."
          : status?.state === "disconnected" ? "Reconnect Dexcom to collect readings for new meals. Your previous history is kept."
            : status ? "Connect Dexcom to see glucose history alongside your meals."
              : "Checking whether Dexcom is connected.";

  return (
    <Card className="gap-6 rounded-2xl py-5">
      <CardHeader className={`${styles.headerGrid} px-5 sm:px-6`}>
          <CardTitle>Dexcom Status</CardTitle>
          <p role="status" aria-busy={busy || loadingStatus} className="flex items-center gap-2 text-sm font-medium">
            {busy || loadingStatus ? <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none" /> : <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${busy ? "bg-muted-foreground" : statusError || needsAttention ? "bg-amber-500" : enabled ? "bg-emerald-600" : "bg-muted-foreground"}`} />}
            {title}
          </p>
        <CardDescription>{description}</CardDescription>
          <p className="text-xs text-muted-foreground">{busy && status ? `Previously: ${titles[status.state]} · ` : ""}Last connection check: {status?.last_check_at ? <time dateTime={status.last_check_at}>{new Date(status.last_check_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time> : "Not yet checked"}</p>
      </CardHeader>
      <CardContent className="space-y-5 px-5 sm:px-6">

        {statusError ? (
          <Button type="button" disabled={busy || loadingStatus} className="min-h-11" onClick={() => setRevision((value) => value + 1)}>Try again</Button>
        ) : !enabled && status && !showForm ? (
            <Button type="button" disabled={busy || loadingStatus} className="min-h-11" aria-expanded={showForm} aria-controls={formId} onClick={() => setShowForm(true)}>Connect Dexcom account</Button>
        ) : null}

        {enabled && (
          <div className="space-y-4 rounded-xl border p-4">
            <h3 className="text-sm font-medium">Manage connection</h3>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy || loadingStatus} className="min-h-11 bg-background px-3 shadow-none" aria-expanded={showForm} aria-controls={formId} onClick={() => setShowForm(!showForm)}>Update login details</Button>
              <Button type="button" variant="outline" disabled={busy || loadingStatus} className="min-h-11 bg-background px-3 shadow-none" onClick={() => void mutate("check")}>{needsAttention ? "Try again" : "Test connection"}</Button>
              <Button type="button" variant="outline" disabled={busy || loadingStatus} className="min-h-11 bg-background px-3 shadow-none" onClick={() => {
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
              <Field><FieldLabel htmlFor="dexcom-username">Dexcom username</FieldLabel><Input id="dexcom-username" name="username" autoComplete="off" maxLength={320} disabled={busy || loadingStatus} required /></Field>
              <Field><FieldLabel htmlFor="dexcom-password">Dexcom password</FieldLabel><Input id="dexcom-password" name="password" type="password" autoComplete="off" maxLength={1000} disabled={busy || loadingStatus} required /></Field>
              <Field>
                <FieldLabel htmlFor="dexcom-region">Dexcom account region</FieldLabel>
                <select id="dexcom-region" name="region" defaultValue={status?.region ?? "ous"} disabled={busy || loadingStatus} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                  <option value="us">United States</option><option value="ous">Outside United States</option><option value="jp">Japan</option>
                </select>
                <FieldDescription>Use the region of your Dexcom account.</FieldDescription>
              </Field>
              <Field>
                <FieldDescription>Use your own Dexcom login, not a follower’s. Share must be enabled. Your login details are encrypted and saved so Mealog can collect readings for your meals.</FieldDescription>
                <Button type="submit" disabled={busy || loadingStatus} className="min-h-11">{action === "connect" ? "Connecting…" : "Connect Dexcom"}</Button>
                <Button type="button" variant="outline" disabled={busy || loadingStatus} className="min-h-11" onClick={() => setShowForm(false)}>Cancel</Button>
              </Field>
            </FieldGroup>
              </form>
              )}
            </div>
          </div>
        {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      </CardContent>
    </Card>
  );
}
