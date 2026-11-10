"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";

import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { apiRequest } from "@/lib/api";
import type { Meal } from "@/lib/meals";
import MealContextForm from "@/components/meals/meal-context-form";
import MealCreateForm from "@/components/meals/meal-create-form";
import InsulinEventsPanel from "@/components/insulin/insulin-events-panel";
import MealGlucoseChart from "@/components/glucose/meal-glucose-chart";

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Something went wrong.";
}

export default function AccountPage() {
    const [session, setSession] = useState<Session | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const supabase = getSupabaseBrowser();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            setSession(nextSession);
            setReady(true);
        });

        return () => subscription.unsubscribe();
    }, []);

    if (!ready) {
        return <main className="p-8">Checking your session…</main>;
    }

    return (
        <main className="mx-auto max-w-xl space-y-6 p-8">
            <h1 className="text-2xl font-semibold">Mealog</h1>

            {session ? (
                <PrivateMeals key={session.user.id} session={session} />
            ) : (
                <AuthForm />
            )}
        </main>
    );
}

function AuthForm() {
    const [mode, setMode] = useState<"login" | "register">("login");
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const form = event.currentTarget;
        const values = new FormData(form);

        const email = String(values.get("email")).trim();
        const password = String(values.get("password"));

        setBusy(true);
        setMessage("");

        try {
            const supabase = getSupabaseBrowser();

            const result =
                mode === "register"
                    ? await supabase.auth.signUp({ email, password })
                    : await supabase.auth.signInWithPassword({ email, password });

            if (result.error) {
                throw result.error;
            }

            form.reset();

            if (mode === "register" && !result.data.session) {
                setMessage("Check your email to confirm your account, then log in.");
            }
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="space-y-4">
            <h2>{mode === "login" ? "Log in" : "Create an account"}</h2>

            <form onSubmit={submit} className="space-y-3">
                <fieldset disabled={busy} className="space-y-3">
                    <label className="block">
                        Email
                        <input
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            className="block w-full rounded border p-2"
                        />
                    </label>

                    <label className="block">
                        Password
                        <input
                            name="password"
                            type="password"
                            autoComplete={
                                mode === "register" ? "new-password" : "current-password"
                            }
                            minLength={8}
                            required
                            className="block w-full rounded border p-2"
                        />
                    </label>

                    <button type="submit" className="rounded border px-4 py-2">
                        {busy ? "Please wait…" : mode === "login" ? "Log in" : "Register"}
                    </button>
                </fieldset>
            </form>

            <button
                type="button"
                disabled={busy}
                onClick={() => {
                    setMode(mode === "login" ? "register" : "login");
                    setMessage("");
                }}
                className="underline"
            >
                {mode === "login" ? "Create an account instead" : "Log in instead"}
            </button>

            <p role="status">{message}</p>
        </section>
    );
}

function PrivateMeals({ session }: { session: Session }) {
    const [timelineVersion, setTimelineVersion] = useState(0);
    const [meals, setMeals] = useState<Meal[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");

    const token = session.access_token;

    useEffect(() => {
        let active = true;

        apiRequest<Meal[]>("/meals", token)
            .then((rows) => {
                if (active) setMeals(rows);
            })
            .catch((error: unknown) => {
                if (active) setMessage(errorMessage(error));
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [token]);

    function addSavedMeal(saved: Meal) {
        setMeals((current) =>
            [saved, ...current]
                .sort(
                    (a, b) =>
                        Date.parse(b.eaten_at) - Date.parse(a.eaten_at),
                )
                .slice(0, 50),
        );

        setTimelineVersion((version) => version + 1);
    }

    async function logOut() {
        setBusy(true);

        try {
            const { error } = await getSupabaseBrowser().auth.signOut();
            if (error) throw error;
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    function replaceMeal(updated: Meal) {
        setTimelineVersion((version) => version + 1);
        setMeals((current) =>
            current.map((meal) =>
                meal.id === updated.id ? updated : meal,
            ),
        );
    }

    return (
        <section className="space-y-6">
            <div>
                <p>Signed in as {session.user.email}</p>
                <button
                    type="button"
                    onClick={logOut}
                    disabled={busy}
                    className="underline"
                >
                    Log out
                </button>
            </div>

            <MealCreateForm
                accessToken={token}
                disabled={loading}
                onSaved={addSavedMeal}
            />

            <p role="status">{message}</p>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold">Your meals</h2>

                {loading ? (
                    <p>Loading meals…</p>
                ) : meals.length === 0 ? (
                    <p>No meals yet.</p>
                ) : (
                    <ul className="space-y-3">
                        {meals.map((meal) => (
                            <li key={meal.id} className="rounded border p-3">
                                <strong>{meal.name}</strong>
                                <p>
                                    {meal.carbohydrates_g === null
                                        ? "Carbohydrates unknown"
                                        : `${meal.carbohydrates_g} g carbohydrates in the full serving`}
                                </p>
                                <p>{new Date(meal.eaten_at).toLocaleString()}</p>

                                <MealContextForm
                                    meal={meal}
                                    accessToken={token}
                                    onSaved={replaceMeal}
                                />

                                <MealGlucoseChart
                                    key={`${meal.id}-${timelineVersion}`}
                                    mealId={meal.id}
                                    accessToken={token}
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </section>
            {!loading && (
                <InsulinEventsPanel
                    accessToken={token}
                    meals={meals}
                    onSaved={() => setTimelineVersion((version) => version + 1)}
                />
            )}
        </section>
    );
}
