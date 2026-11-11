"use client";

import Image from "next/image";
import {
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type FormEvent,
} from "react";

import { apiRequest } from "@/lib/api";
import type { Meal } from "@/lib/meals";


type PhotoDraft = {
    status: "estimated" | "needs_context" | "not_food";
    name: string | null;
    carbohydrates_g: number | null;
    foods: string[];
    assumptions: string[];
    message: string;
};

type Props = {
    accessToken: string;
    disabled?: boolean;
    onSaved: (meal: Meal) => void;
};

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);

function readBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onerror = () => reject(
            new Error("The selected photo could not be read."),
        );

        reader.onload = () => {
            const result = reader.result;

            if (typeof result !== "string" || !result.includes(",")) {
                reject(new Error("The selected photo could not be read."));
                return;
            }

            resolve(result.slice(result.indexOf(",") + 1));
        };

        reader.readAsDataURL(file);
    });
}

function errorMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : "Something went wrong.";
}

export default function MealCreateForm({
    accessToken,
    disabled = false,
    onSaved,
}: Props) {
    const [name, setName] = useState("");
    const [carbs, setCarbs] = useState("");
    const [picturedCarbs, setPicturedCarbs] = useState<number | null>(null);
    const [photoShare, setPhotoShare] = useState("1");
    const [fractionConsumed, setFractionConsumed] = useState("");
    const [eatenAt, setEatenAt] = useState("");

    const [photo, setPhoto] = useState<File | null>(null);
    const [preview, setPreview] = useState("");
    const [context, setContext] = useState("");
    const [draft, setDraft] = useState<PhotoDraft | null>(null);
    const [fileVersion, setFileVersion] = useState(0);

    const [working, setWorking] = useState<"estimate" | "save" | null>(null);
    const [message, setMessage] = useState("");

    const request = useRef<AbortController | null>(null);
    const previewUrl = useRef<string | null>(null);

    useEffect(() => {
        return () => {
            request.current?.abort();

            if (previewUrl.current) {
                URL.revokeObjectURL(previewUrl.current);
            }
        };
    }, []);

    const busy = disabled || working !== null;

    function releasePhoto() {
        if (previewUrl.current) {
            URL.revokeObjectURL(previewUrl.current);
            previewUrl.current = null;
        }

        setPhoto(null);
        setPreview("");
        setPicturedCarbs(null);
        setPhotoShare("1");
        setFileVersion((version) => version + 1);
    }

    function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
        const selected = event.target.files?.[0] ?? null;

        releasePhoto();
        setDraft(null);
        setMessage("");

        if (!selected) return;

        if (!PHOTO_TYPES.has(selected.type)) {
            setMessage("Choose a JPEG, PNG or WebP photo.");
            return;
        }

        if (selected.size > MAX_PHOTO_BYTES) {
            setMessage("Choose a photo smaller than 5 MB.");
            return;
        }

        const url = URL.createObjectURL(selected);
        previewUrl.current = url;
        setPreview(url);
        setPhoto(selected);
    }

    async function analyzePhoto() {
        if (!photo || request.current || disabled) return;

        const controller = new AbortController();
        request.current = controller;
        setWorking("estimate");
        setMessage("");

        try {
            const imageBase64 = await readBase64(photo);
            if (controller.signal.aborted) return;

            const result = await apiRequest<PhotoDraft>(
                "/meal-estimates",
                accessToken,
                {
                    method: "POST",
                    body: JSON.stringify({
                        image_base64: imageBase64,
                        context,
                    }),
                    signal: AbortSignal.any([
                        controller.signal,
                        AbortSignal.timeout(95_000),
                    ]),
                },
            );

            if (controller.signal.aborted) return;

            setDraft(result);

            if (result.status !== "not_food") {
                setName(result.name ?? "");
                setPicturedCarbs(result.carbohydrates_g);
                setPhotoShare("1");

                setCarbs(
                    result.carbohydrates_g === null
                        ? ""
                        : String(result.carbohydrates_g),
                );
            }

            setMessage(result.message);
        } catch (error) {
            if (!controller.signal.aborted) {
                setMessage(
                    `${errorMessage(error)} You can still enter the meal manually.`,
                );
            }
        } finally {
            if (request.current === controller) {
                request.current = null;
            }

            if (!controller.signal.aborted) {
                setWorking(null);
            }
        }
    }

    async function saveMeal(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (request.current || disabled) return;

        const controller = new AbortController();
        request.current = controller;
        setWorking("save");
        setMessage("");

        try {
            const saved = await apiRequest<Meal>(
                "/meals",
                accessToken,
                {
                    method: "POST",
                    body: JSON.stringify({
                        name: name.trim(),
                        carbohydrates_g: carbs === "" ? null : Number(carbs),
                        fraction_consumed:
                            fractionConsumed === ""
                                ? null
                                : Number(fractionConsumed),
                        eaten_at: new Date(eatenAt).toISOString(),
                        notes: null,
                    }),
                    signal: AbortSignal.any([
                        controller.signal,
                        AbortSignal.timeout(15_000),
                    ]),
                },
            );

            if (controller.signal.aborted) return;

            onSaved(saved);

            setName("");
            setCarbs("");
            setFractionConsumed("");
            setEatenAt("");
            setContext("");
            setDraft(null);
            releasePhoto();
            setMessage("Meal saved.");
        } catch (error) {
            if (!controller.signal.aborted) {
                setMessage(errorMessage(error));
            }
        } finally {
            if (request.current === controller) {
                request.current = null;
            }

            if (!controller.signal.aborted) {
                setWorking(null);
            }
        }
    }

    return (
        <section className="space-y-4 rounded border p-4">
            <h2 className="text-xl font-semibold">Log a meal</h2>

            <fieldset disabled={busy} className="space-y-3">
                <legend>Start with a photo — optional</legend>

                <p className="text-sm">
                    Your photo and description are sent to OpenAI to suggest
                    a draft. Review the name and carbohydrates before saving.
                </p>

                <label className="block">
                    Meal photo
                    <input
                        key={fileVersion}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={choosePhoto}
                        className="block w-full rounded border p-2"
                    />
                </label>

                {preview && (
                    <Image
                        src={preview}
                        alt="Selected meal"
                        width={640}
                        height={480}
                        unoptimized
                        className="max-h-64 w-full rounded object-contain"
                    />
                )}

                <label className="block">
                    Meal description or portion details — optional
                    <textarea
                        value={context}
                        maxLength={1000}
                        rows={3}
                        placeholder="For example: one bowl of rice with chicken; sauce on the side."
                        onChange={(event) => {
                            setContext(event.target.value);
                            setDraft(null);
                        }}
                        className="block w-full rounded border p-2"
                    />
                </label>

                <button
                    type="button"
                    disabled={!photo || busy}
                    onClick={analyzePhoto}
                    className="rounded border px-4 py-2"
                >
                    {working === "estimate"
                        ? "Analyzing photo…"
                        : "Analyze photo"}
                </button>
            </fieldset>

            {draft && (
                <div className="space-y-2 rounded border p-3">
                    <strong>Photo suggestion — please review</strong>

                    {draft.foods.length > 0 && (
                        <p>Detected foods: {draft.foods.join(", ")}</p>
                    )}

                    {draft.assumptions.length > 0 && (
                        <ul className="list-disc pl-5">
                            {draft.assumptions.map((assumption, index) => (
                                <li key={`${index}-${assumption}`}>
                                    {assumption}
                                </li>
                            ))}
                        </ul>
                    )}

                    {draft.status === "needs_context" && (
                        <p>
                            Add more detail and analyze again, or enter
                            the carbohydrate amount yourself.
                        </p>
                    )}

                    <p className="text-sm">
                        Carbohydrates are an estimate for the full pictured
                        serving, not a measured amount.
                    </p>
                </div>
            )}

            <form onSubmit={saveMeal}>
                <fieldset disabled={busy} className="space-y-3">
                    <legend>Review and save</legend>

                    <label className="block">
                        Meal name
                        <input
                            name="name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            required
                            maxLength={200}
                            className="block w-full rounded border p-2"
                        />
                    </label>

                    {picturedCarbs !== null && (
                        <label className="block">
                            My share of the pictured food
                            <select
                                value={photoShare}
                                onChange={(event) => {
                                    const share = event.target.value;
                                    setPhotoShare(share);

                                    setCarbs(
                                        String(
                                            Math.round(
                                                picturedCarbs * Number(share) * 100,
                                            ) / 100,
                                        ),
                                    );
                                }}
                                className="block w-full rounded border p-2"
                            >
                                <option value="1">All pictured food</option>
                                <option value="0.75">Three quarters</option>
                                <option value="0.5">Half</option>
                                <option value="0.3333333333">One third</option>
                                <option value="0.25">One quarter</option>
                                <option value="0.2">One fifth</option>
                            </select>

                            <span className="block text-sm">
                                Changing this recalculates the suggested carbohydrates.
                                You can still correct the amount below.
                            </span>
                        </label>
                    )}

                    <label className="block">
                        Carbohydrates in my full serving — optional
                        <input
                            name="carbohydrates_g"
                            value={carbs}
                            onChange={(event) => setCarbs(event.target.value)}
                            type="number"
                            min="0"
                            max="999999.99"
                            step="0.01"
                            className="block w-full rounded border p-2"
                        />
                    </label>

                    <label className="block">
                        How much of my serving did I actually eat?
                        <select
                            value={fractionConsumed}
                            onChange={(event) => setFractionConsumed(event.target.value)}
                            className="block w-full rounded border p-2"
                        >
                            <option value="">Unknown / not recorded yet</option>
                            <option value="1">All</option>
                            <option value="0.75">Three quarters</option>
                            <option value="0.5">Half</option>
                            <option value="0.25">One quarter</option>
                            <option value="0">None</option>
                        </select>
                    </label>

                    <label className="block">
                        Eating time — your device&apos;s timezone
                        <input
                            name="eaten_at"
                            value={eatenAt}
                            onChange={(event) => setEatenAt(event.target.value)}
                            type="datetime-local"
                            required
                            className="block w-full rounded border p-2"
                        />
                    </label>

                    <button
                        type="submit"
                        className="rounded border px-4 py-2"
                    >
                        {working === "save"
                            ? "Saving…"
                            : "Confirm and save meal"}
                    </button>
                </fieldset>
            </form>

            <p role="status" aria-live="polite">
                {message}
            </p>
        </section>
    );
}
