/** Join API paths consistently, including when the configured origin ends in '/'. */
export function apiUrl(path: string): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!configured) throw new Error("Mealog’s service is not configured yet. Please try again later.");
  let base: URL;
  try { base = new URL(configured); }
  catch { throw new Error("Mealog’s service is not configured correctly. Please try again later."); }
  if (!["http:", "https:"].includes(base.protocol) || base.search || base.hash || base.username || base.password) {
    throw new Error("Mealog’s service is not configured correctly. Please try again later.");
  }
  return `${base.origin}${base.pathname.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
