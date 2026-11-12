"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./welcome-screen.module.css";
import AnimatedMealogLogo from "./animated-mealog-logo";

const SESSION_KEY = "mealog:welcome-seen:v1";
const ANIMATION_DURATION_MS = 2800;
const DESTINATION = "/login";

type WelcomeScreenProps = {
    // Enable temporarily while adjusting the animation.
    replayAlways?: boolean;
};

export default function WelcomeScreen({
    replayAlways = false,
}: WelcomeScreenProps) {
    const router = useRouter();
    const [playing, setPlaying] = useState(false);

    const rememberWelcome = useCallback(() => {
        try {
            sessionStorage.setItem(SESSION_KEY, "true");
        } catch {
            // Navigation still works if browser storage is unavailable.
        }
    }, []);

    const finishWelcome = useCallback(() => {
        rememberWelcome();
        router.replace(DESTINATION);
    }, [rememberWelcome, router]);

    useEffect(() => {
        // Prepare the destination while the animation runs.
        router.prefetch(DESTINATION);

        let alreadySeen = false;

        try {
            alreadySeen = sessionStorage.getItem(SESSION_KEY) === "true";
        } catch {
            // If storage is unavailable, show the welcome normally.
        }

        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        );

        if (
            reducedMotion.matches ||
            (alreadySeen && !replayAlways)
        ) {
            finishWelcome();
            return;
        }

        let timer: ReturnType<typeof setTimeout> | undefined;

        // Start CSS animation and its timer together after mounting.
        const frame = requestAnimationFrame(() => {
            setPlaying(true);
            timer = setTimeout(finishWelcome, ANIMATION_DURATION_MS);
        });

        // Also respond if the preference changes while this page is open.
        function handleMotionChange(event: MediaQueryListEvent) {
            if (event.matches) finishWelcome();
        }

        reducedMotion.addEventListener("change", handleMotionChange);

        return () => {
            cancelAnimationFrame(frame);
            if (timer !== undefined) clearTimeout(timer);
            reducedMotion.removeEventListener("change", handleMotionChange);
        };
    }, [finishWelcome, replayAlways, router]);

    return (
        <main
            className={`${styles.screen} ${playing ? styles.playing : ""}`}
            aria-label="Welcome to Mealog"
        >
            <div className={styles.brand}>
                <AnimatedMealogLogo playing={playing} />

                <h1 className="sr-only">Mealog</h1>

                <p className={styles.tagline}>
                    Your meals, remembered.
                </p>
            </div>

            <Link
                href={DESTINATION}
                replace
                onClick={rememberWelcome}
                className={styles.continueLink}
            >
                Continue to Mealog
            </Link>
        </main>
    );
}