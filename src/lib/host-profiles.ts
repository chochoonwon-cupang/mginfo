import { headers } from "next/headers";
import { toASCII, toUnicode } from "node:punycode";
import { apexDomain, cleanHost } from "./ops-ledger";
import { parseMainLandingConfig, type MainLandingConfig } from "./main-landing";
import type { HostSiteProfile, Settings, Store } from "./types";

export function normalizeHostKey(raw: string): string {
  const host = cleanHost(String(raw || "").split(",")[0]?.trim() || "");
  if (!host || host.includes("vercel.app") || host === "localhost") return "";
  try {
    return new URL(`https://${host}`).hostname.toLowerCase();
  } catch {
    return host.toLowerCase();
  }
}

export async function getRequestHost(): Promise<string> {
  const h = await headers();
  const raw = h.get("x-forwarded-host") || h.get("host") || "";
  return normalizeHostKey(raw);
}

export function parseHostSiteProfile(raw: unknown, fallback?: HostSiteProfile | null): HostSiteProfile | null {
  if (!raw || typeof raw !== "object") return fallback || null;
  const row = raw as Record<string, unknown>;
  const mainLanding = parseMainLandingConfig(row.mainLanding ?? fallback?.mainLanding);
  return {
    siteName: String(row.siteName ?? fallback?.siteName ?? "").trim() || undefined,
    siteTagline: String(row.siteTagline ?? fallback?.siteTagline ?? "").trim() || undefined,
    vendorGroupId:
      String(row.vendorGroupId ?? fallback?.vendorGroupId ?? "").trim() || undefined,
    company: String(row.company ?? fallback?.company ?? "").trim() || undefined,
    phone: String(row.phone ?? fallback?.phone ?? "").trim() || undefined,
    address: String(row.address ?? fallback?.address ?? "").trim() || undefined,
    bizNo: String(row.bizNo ?? fallback?.bizNo ?? "").trim() || undefined,
    naverSiteVerification:
      String(row.naverSiteVerification ?? fallback?.naverSiteVerification ?? "").trim() || undefined,
    mainLanding,
    updatedAt: String(row.updatedAt ?? fallback?.updatedAt ?? "").trim() || undefined,
  };
}

export function normalizeHostProfiles(raw: unknown): Record<string, HostSiteProfile> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, HostSiteProfile> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const host = normalizeHostKey(key);
    if (!host) continue;
    const profile = parseHostSiteProfile(value);
    if (profile) out[host] = profile;
  }
  return out;
}

export function getHostProfile(store: Pick<Store, "hostProfiles">, host: string): HostSiteProfile | null {
  return resolveHostProfile(store, host);
}

/** Keyword subdomain (not apex / not www-only). */
export function isKeywordSubdomainHost(host: string): boolean {
  const h = normalizeHostKey(host);
  if (!h || h.includes("vercel.app")) return false;
  const apex = apexDomain(h);
  if (!apex || h === apex) return false;
  if (h === `www.${apex}`) return false;
  return h.endsWith(`.${apex}`);
}

export function hostProfileAliasKeys(host: string): string[] {
  const key = normalizeHostKey(host);
  if (!key) return [];
  const out = new Set<string>([key]);
  try {
    out.add(new URL(`https://${key}`).hostname.toLowerCase());
  } catch {
    /* ignore */
  }
  const parts = key.split(".");
  if (parts.length >= 2) {
    const apex = parts.slice(-2).join(".");
    const label = parts.slice(0, -2).join(".") || parts[0];
    if (label?.toLowerCase().startsWith("xn--")) {
      try {
        out.add(`${toUnicode(label)}.${apex}`.toLowerCase());
      } catch {
        /* ignore */
      }
    } else if (label && /[^\x00-\x7f]/.test(label)) {
      try {
        out.add(`${toASCII(label)}.${apex}`.toLowerCase());
      } catch {
        /* ignore */
      }
    }
  }
  return [...out];
}

/** Exact key, then URL-normalized aliases (punycode ↔ unicode). */
export function resolveHostProfile(
  store: Pick<Store, "hostProfiles">,
  host: string
): HostSiteProfile | null {
  if (!store.hostProfiles) return null;
  for (const key of hostProfileAliasKeys(host)) {
    const hit = store.hostProfiles[key];
    if (hit) return hit;
  }
  return null;
}

/** Merge host-specific main/vendor fields onto global settings (home `/` only). */
export function mergeHostIntoSettings(global: Settings, profile: HostSiteProfile | null): Settings {
  if (!profile) return global;
  return {
    ...global,
    siteName: profile.siteName || global.siteName,
    siteTagline: profile.siteTagline || global.siteTagline,
    company: profile.company ?? global.company,
    phone: profile.phone ?? global.phone,
    address: profile.address ?? global.address,
    bizNo: profile.bizNo ?? global.bizNo,
    naverSiteVerification: profile.naverSiteVerification || global.naverSiteVerification,
    mainLanding: profile.mainLanding,
  };
}

const HOST_SCOPED_ADMIN_TEXT_KEYS = [
  "siteName",
  "siteTagline",
  "company",
  "ceo",
  "bizNo",
  "address",
  "phone",
  "email",
  "footerDisclaimer",
] as const;

function hostProfileSeedFromGlobal(global: Settings): HostSiteProfile {
  return parseHostSiteProfile({
    siteName: global.siteName,
    siteTagline: global.siteTagline,
    company: global.company,
    phone: global.phone,
    address: global.address,
    bizNo: global.bizNo,
    mainLanding: global.mainLanding,
  })!;
}

/** Admin / enrich on keyword subdomain → persist hostProfiles (public `/` reads this). */
export function applyHostScopedAdminPatch(
  store: Store,
  host: string,
  body: Record<string, unknown>
): boolean {
  const hostKey = normalizeHostKey(host);
  if (!hostKey || !isKeywordSubdomainHost(hostKey)) return false;

  const touchesHost =
    body.mainLanding !== undefined ||
    HOST_SCOPED_ADMIN_TEXT_KEYS.some((k) => typeof body[k] === "string");
  if (!touchesHost) return false;

  if (!store.hostProfiles) store.hostProfiles = {};
  const prev = resolveHostProfile(store, hostKey);
  const seed = prev || hostProfileSeedFromGlobal(store.settings);
  const row: Record<string, unknown> = { ...seed };

  for (const key of HOST_SCOPED_ADMIN_TEXT_KEYS) {
    if (typeof body[key] === "string") {
      row[key] = body[key].trim();
    }
  }
  if (body.mainLanding !== undefined) {
    row.mainLanding = parseMainLandingConfig(body.mainLanding);
  }
  row.updatedAt = new Date().toISOString();

  const profile = parseHostSiteProfile(row, prev);
  if (!profile) return true;

  store.hostProfiles[hostKey] = profile;
  if (body.mainLanding !== undefined) {
    store.settings.mainLanding = parseMainLandingConfig({ enabled: false });
  }
  return true;
}

export function saveHostProfileMainLanding(store: Store, host: string, mainLanding: MainLandingConfig): void {
  applyHostScopedAdminPatch(store, host, { mainLanding });
}

/** Bootstrap / master PUT — write keyword subdomain profile (public home reads this). */
export function upsertKeywordHostProfile(
  store: Store,
  host: string,
  body: Record<string, unknown>
): HostSiteProfile | null {
  const hostKey = normalizeHostKey(host);
  if (!hostKey || !isKeywordSubdomainHost(hostKey)) return null;

  if (!store.hostProfiles) store.hostProfiles = {};
  const prev = resolveHostProfile(store, hostKey);
  const draft = hostProfileFromBootstrapBody(body);
  const profile = parseHostSiteProfile(
    {
      ...draft,
      mainLanding: parseMainLandingConfig({
        ...draft.mainLanding,
        enabled: true,
      }),
    },
    prev
  );
  if (!profile) return null;

  const aliasKeys = new Set<string>([hostKey]);
  if (Array.isArray(body.hostAliases)) {
    for (const alias of body.hostAliases) {
      const k = normalizeHostKey(String(alias || ""));
      if (k) aliasKeys.add(k);
    }
  }
  for (const k of aliasKeys) {
    store.hostProfiles[k] = profile;
  }
  store.settings.mainLanding = parseMainLandingConfig({ enabled: false });
  return profile;
}

export function hostProfileFromBootstrapBody(body: Record<string, unknown>): HostSiteProfile {
  const mainLanding = parseMainLandingConfig(body.mainLanding);
  return {
    siteName: typeof body.siteName === "string" ? body.siteName.trim() : undefined,
    siteTagline: typeof body.siteTagline === "string" ? body.siteTagline.trim() : undefined,
    vendorGroupId:
      typeof body.vendorGroupId === "string" && body.vendorGroupId.trim()
        ? body.vendorGroupId.trim()
        : undefined,
    company: typeof body.company === "string" ? body.company.trim() : undefined,
    phone: typeof body.phone === "string" ? body.phone.trim() : undefined,
    address: typeof body.address === "string" ? body.address.trim() : undefined,
    bizNo: typeof body.bizNo === "string" ? body.bizNo.trim() : undefined,
    naverSiteVerification:
      typeof body.naverSiteVerification === "string" ? body.naverSiteVerification.trim() : undefined,
    mainLanding,
    updatedAt: new Date().toISOString(),
  };
}
