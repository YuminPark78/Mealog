"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

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

export function ForgotPasswordForm() {
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (busy) return;

        const values = new FormData(event.currentTarget);
        const email = String(values.get("email") ?? "").trim();

        setBusy(true);
        setError("");

        try {
            const supabase = getSupabaseBrowser();

            const { error } = await supabase.auth.resetPasswordForEmail(
                email,
                {
                    redirectTo: `${window.location.origin}/reset-password`,
                },
            );

            if (error) throw error;

            setSent(true);
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "Could not request a recovery email. Please try again.",
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
                        {sent ? "Check your email" : "Forgot your password?"}
                    </CardTitle>

                    <CardDescription>
                        {sent
                            ? "Follow the recovery link to choose a new password."
                            : "Enter your email and we’ll send you a recovery link."}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {sent ? (
                        <FieldGroup>
                            <Field>
                                <p
                                    role="status"
                                    className="text-sm text-muted-foreground"
                                >
                                    If an account exists for this email address, we’ve
                                    sent a password recovery link.
                                </p>
                            </Field>

                            <Field>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setSent(false);
                                        setError("");
                                    }}
                                >
                                    Try another email
                                </Button>

                                <FieldDescription className="text-center">
                                    <Link href="/login" prefetch={false}>
                                        Back to login
                                    </Link>
                                </FieldDescription>
                            </Field>
                        </FieldGroup>
                    ) : (
                        <form onSubmit={handleSubmit} aria-busy={busy}>
                            <FieldGroup>
                                <Field>
                                    <FieldLabel htmlFor="recovery-email">
                                        Email
                                    </FieldLabel>

                                    <Input
                                        id="recovery-email"
                                        name="email"
                                        type="email"
                                        placeholder="m@example.com"
                                        autoComplete="email"
                                        autoCapitalize="none"
                                        spellCheck={false}
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
                                        {busy ? "Sending…" : "Send recovery link"}
                                    </Button>

                                    <FieldDescription className="text-center">
                                        <Link href="/login" prefetch={false}>
                                            Back to login
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