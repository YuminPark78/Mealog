"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { getSupabaseBrowser } from "@/lib/supabase-browser";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Status = "checking" | "ready" | "invalid" | "success";

export function ResetPasswordForm() {
    const [status, setStatus] = useState<Status>("checking");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;

        async function checkRecoverySession() {
            try {
                const url = new URL(window.location.href);
                const hash = new URLSearchParams(url.hash.slice(1));

                // Supabase may return an error for an expired or used link.
                const linkHasError =
                    url.searchParams.has("error") ||
                    url.searchParams.has("error_code") ||
                    hash.has("error") ||
                    hash.has("error_code");

                if (linkHasError) {
                    if (active) setStatus("invalid");
                    return;
                }

                const supabase = getSupabaseBrowser();

                // With the existing browser client, Supabase processes the
                // recovery URL during its authentication initialisation.
                const { data, error } = await supabase.auth.getUser();

                if (!active) return;

                setStatus(error || !data.user ? "invalid" : "ready");
            } catch {
                if (active) setStatus("invalid");
            }
        }

        void checkRecoverySession();

        return () => {
            active = false;
        };
    }, []);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (busy || status !== "ready") return;

        const form = event.currentTarget;
        const values = new FormData(form);

        const password = String(values.get("password") ?? "");
        const confirmation = String(values.get("confirmation") ?? "");

        setError("");

        if (password.length < 8) {
            setError("Use at least 8 characters.");
            return;
        }

        if (password !== confirmation) {
            setError("Your passwords do not match.");
            return;
        }

        setBusy(true);

        try {
            const supabase = getSupabaseBrowser();

            // Check again in case the session expired while the form was open.
            const {
                data: { user },
                error: sessionError,
            } = await supabase.auth.getUser();

            if (sessionError || !user) {
                setStatus("invalid");
                return;
            }

            const { error } = await supabase.auth.updateUser({
                password,
            });

            if (error) throw error;

            form.reset();
            setStatus("success");
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "Could not update your password. Please try again.",
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>
                        {status === "checking"
                            ? "Checking your recovery link"
                            : status === "invalid"
                                ? "Request a new recovery link"
                                : status === "success"
                                    ? "Password updated"
                                    : "Choose a new password"}
                    </CardTitle>

                    <CardDescription>
                        {status === "checking"
                            ? "Please wait a moment."
                            : status === "invalid"
                                ? "Your link may have expired or already been used."
                                : status === "success"
                                    ? "Your new password has been saved."
                                    : "Use at least 8 characters."}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {status === "checking" && (
                        <p
                            role="status"
                            className="text-sm text-muted-foreground"
                        >
                            Checking your session…
                        </p>
                    )}

                    {status === "invalid" && (
                        <FieldGroup>
                            <Field>
                                <p
                                    role="alert"
                                    className="text-sm text-muted-foreground"
                                >
                                    Open a fresh recovery link from your email to try again.
                                </p>

                                <FieldDescription className="text-center">
                                    <Link href="/forgot-password" prefetch={false}>
                                        Request another link
                                    </Link>
                                </FieldDescription>
                            </Field>
                        </FieldGroup>
                    )}

                    {status === "success" && (
                        <FieldGroup>
                            <Field>
                                <p
                                    role="status"
                                    className="text-sm text-muted-foreground"
                                >
                                    You can now use your new password to log in.
                                    You’re already signed in on this device.
                                </p>

                                <FieldDescription className="text-center">
                                    <Link href="/account" prefetch={false}>
                                        Continue to Mealog
                                    </Link>
                                </FieldDescription>
                            </Field>
                        </FieldGroup>
                    )}

                    {status === "ready" && (
                        <form onSubmit={handleSubmit} aria-busy={busy}>
                            <FieldGroup>
                                <Field>
                                    <FieldLabel htmlFor="new-password">
                                        New password
                                    </FieldLabel>

                                    <Input
                                        id="new-password"
                                        name="password"
                                        type="password"
                                        autoComplete="new-password"
                                        minLength={8}
                                        disabled={busy}
                                        required
                                    />
                                </Field>

                                <Field>
                                    <FieldLabel htmlFor="confirm-password">
                                        Confirm new password
                                    </FieldLabel>

                                    <Input
                                        id="confirm-password"
                                        name="confirmation"
                                        type="password"
                                        autoComplete="new-password"
                                        minLength={8}
                                        disabled={busy}
                                        required
                                    />
                                </Field>

                                {error && (
                                    <Field>
                                        <p
                                            role="alert"
                                            className="text-sm text-destructive"
                                        >
                                            {error}
                                        </p>
                                    </Field>
                                )}

                                <Field>
                                    <Button type="submit" disabled={busy}>
                                        {busy ? "Saving…" : "Save new password"}
                                    </Button>

                                    <FieldDescription className="text-center">
                                        <Link href="/forgot-password" prefetch={false}>
                                            Request another recovery link
                                        </Link>
                                    </FieldDescription>
                                </Field>
                            </FieldGroup>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}