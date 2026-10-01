import { parseMainLandingConfig } from "./main-landing";
import { apexDomain, cleanHost } from "./ops-ledger";
import { isKeywordSubdomainHost, normalizeHostKey } from "./host-profiles";
import type { Store } from "./types";

export type ApexContactPatch = {
  company?: string;
  phone?: string;
  address?: string;
  bizNo?: string;
  ceo?: string;
  email?: string;
};

function trimField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Keyword subdomain on this registrable apex (not apex/www itself). */
export function hostProfileOnApex(hostKey: string, apexRaw: string): boolean {
  const h = normalizeHostKey(hostKey);
  const apex = cleanHost(apexRaw).replace(/^www\./, "");
  if (!h || !apex || h.includes("vercel.app")) return false;
  const registrable = apexDomain(h);
  const target = apexDomain(apex);
  if (registrable !== target) return false;
  if (h === target || h === `www.${target}`) return false;
  if (!h.endsWith(`.${target}`)) return false;
  return isKeywordSubdomainHost(h);
}

export function bulkApplyContactToApexHostProfiles(
  store: Store,
  apexRaw: string,
  patch: ApexContactPatch
): { hostsUpdated: number; apex: string } {
  const apex = cleanHost(apexRaw).replace(/^www\./, "") || apexDomain(apexRaw);
  if (!apex) return { hostsUpdated: 0, apex: "" };
  if (!store.hostProfiles) store.hostProfiles = {};

  const company = trimField(patch.company);
  const phone = trimField(patch.phone);
  const address = trimField(patch.address);
  const bizNo = trimField(patch.bizNo);
  const ceo = trimField(patch.ceo);
  const email = trimField(patch.email);
  const hasAny = Boolean(company || phone || address || bizNo || ceo || email);
  if (!hasAny) return { hostsUpdated: 0, apex: apexDomain(apex) || apex };

  let hostsUpdated = 0;
  for (const key of Object.keys(store.hostProfiles)) {
    if (!hostProfileOnApex(key, apex)) continue;
    const profile = store.hostProfiles[key];
    if (!profile) continue;

    if (company) profile.company = company;
    if (phone) profile.phone = phone;
    if (address) profile.address = address;
    if (bizNo) profile.bizNo = bizNo;

    const ml = parseMainLandingConfig(profile.mainLanding);
    const vendor = { ...ml.vendor };
    if (company) vendor.name = company;
    if (phone) vendor.phone = phone;
    if (address) vendor.address = address;
    if (bizNo) vendor.businessNumber = bizNo;

    profile.mainLanding = parseMainLandingConfig({ ...ml, vendor });
    profile.updatedAt = new Date().toISOString();
    store.hostProfiles[key] = profile;
    hostsUpdated += 1;
  }

  return { hostsUpdated, apex: apexDomain(apex) || apex };
}
