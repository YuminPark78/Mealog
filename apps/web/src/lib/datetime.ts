/** Populate datetime-local in device time, retaining seconds when editing. */
export function toLocalDateTime(value: string | null): string {
    if (!value) return "";
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 23);
}

/** Preserve the original instant (and precision) when its input was unchanged. */
export function fromLocalDateTime(value: string, original: string | null): string {
    if (original && value === toLocalDateTime(original)) return original;
    return new Date(value).toISOString();
}
