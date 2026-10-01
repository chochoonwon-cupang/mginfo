import { SITE_ORIGIN, siteUrl } from "./seo";

/** Canonical hub origin for shared private media (`/api/media/...`). */
export const HUB_MEDIA_ORIGIN =
  String(process.env.NEXT_PUBLIC_HUB_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL || "").trim() ||
  "https://mginfo-phi.vercel.app";

/**
 * Turn a stored media path into an absolute URL.
 * Absolute http(s) unchanged; relative paths join `origin`.
 */
export function absolutizeMediaUrl(url: string | undefined, origin = SITE_ORIGIN): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!raw.startsWith("/")) return raw;
  const base = String(origin || SITE_ORIGIN || HUB_MEDIA_ORIGIN).replace(/\/$/, "");
  return `${base}${raw}`;
}

/** Legacy relative vendor photos (hub private blob) → hub absolute for clones. */
export function publicVendorImageUrl(url: string | undefined): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/api/media/") || raw.startsWith("/uploads/")) {
    return absolutizeMediaUrl(raw, HUB_MEDIA_ORIGIN);
  }
  return raw;
}

export function toSiteAbsoluteMediaUrl(url: string | undefined) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return siteUrl(raw);
  return raw;
}
