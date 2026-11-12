"use client";

import {
  useState,
  type ComponentProps,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "cn";

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

type Mode = "login" | "register";
type PendingAction = "email" | "google" | null;

export function LoginForm({
  className,
  ...props
}: ComponentProps<"div">) {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const registering = mode === "register";
  const busy = pending !== null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    const form = event.currentTarget;
    const values = new FormData(form);

    const email = String(values.get("email") ?? "").trim();
    const password = String(values.get("password") ?? "");

    setError("");
    setMessage("");
    setPending("email");

    try {
      const supabase = getSupabaseBrowser();

      const result = registering
        ? await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/account`,
          },
        })
        : await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (result.error) {
        throw result.error;
      }

      if (result.data.session) {
        router.replace("/account");
        return;
      }

      if (registering) {
        form.reset();
        setMessage(
          "Check your email for a confirmation link, then return to log in.",
        );
      } else {
        setError("Sign-in did not complete. Please try again.");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete authentication. Please try again.",
      );
    } finally {
      setPending(null);
    }
  }

  async function handleGoogleLogin() {
    if (busy) return;

    setError("");
    setMessage("");
    setPending("google");

    try {
      const supabase = getSupabaseBrowser();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/account`,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        throw error;
      }

      if (!data.url) {
        throw new Error("Could not open Google sign-in. Please try again.");
      }

      window.location.assign(data.url);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not start Google sign-in. Please try again.",
      );

      setPending(null);
    }
  }

  function toggleMode() {
    if (busy) return;

    setMode((current) =>
      current === "login" ? "register" : "login",
    );
    setError("");
    setMessage("");
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>
            {registering ? "Create your account" : "Login to your account"}
          </CardTitle>
          <CardDescription>
            {registering
              ? "Enter your email below to create your account"
              : "Enter your email below to login to your account"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            key={mode}
            onSubmit={handleSubmit}
            aria-busy={busy}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
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

              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>

                  {!registering && (
                    <Link
                      href="/forgot-password"
                      prefetch={false}
                      className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                    >
                      Forgot your password?
                    </Link>
                  )}
                </div>

                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={
                    registering ? "new-password" : "current-password"
                  }
                  minLength={registering ? 8 : undefined}
                  disabled={busy}
                  required
                />
              </Field>

              {error && (
                <Field>
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                </Field>
              )}

              {message && (
                <Field>
                  <p role="status" className="text-sm text-muted-foreground">
                    {message}
                  </p>
                </Field>
              )}

              <Field>
                <Button type="submit" disabled={busy}>
                  {pending === "email"
                    ? registering
                      ? "Creating account…"
                      : "Logging in…"
                    : registering
                      ? "Create account"
                      : "Login"}
                </Button>

                <Button
                  variant="outline"
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={busy}
                >
                  {pending === "google"
                    ? "Opening Google…"
                    : registering
                      ? "Continue with Google"
                      : "Continue with Google"}
                </Button>

                <FieldDescription className="text-center">
                  {registering
                    ? "Already have an account? "
                    : "Don't have an account? "}

                  <a
                    href="#"
                    aria-disabled={busy}
                    onClick={(event) => {
                      event.preventDefault();
                      toggleMode();
                    }}
                  >
                    {registering ? "Login" : "Sign up"}
                  </a>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}