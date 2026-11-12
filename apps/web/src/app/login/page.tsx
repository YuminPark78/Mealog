"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    async function initialiseAuth() {
      try {
        const supabase = getSupabaseBrowser();

        const { error } = await supabase.auth.getSession();

        if (error) throw error;
        if (!active) return;

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
          if (!active) return;

          if (session) {
            router.replace("/account");
          } else {
            setChecking(false);
          }
        });

        unsubscribe = () => subscription.unsubscribe();
      } catch (cause) {
        if (!active) return;

        setSessionError(
          cause instanceof Error
            ? cause.message
            : "Could not initialise sign-in.",
        );
        setChecking(false);
      }
    }

    void initialiseAuth();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [router]);

  return (
    <main className="flex min-h-svh w-full flex-1 items-center justify-center bg-background px-5 py-10 text-foreground">
      <div className="w-full max-w-sm space-y-8">
        {/* <div className="text-center">
          <p className="font-sans text-3xl font-semibold tracking-tight">
            Mealog
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            Your meals, remembered.
          </p>
        </div> */}

        {sessionError ? (
          <p role="alert" className="text-center text-sm text-destructive">
            {sessionError}
          </p>
        ) : checking ? (
          <p role="status" className="text-center text-sm text-muted-foreground">
            Checking your session…
          </p>
        ) : (
          <LoginForm />
        )}
      </div>
    </main>
  );
}