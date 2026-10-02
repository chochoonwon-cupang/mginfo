import { hostProfileAliasKeys, normalizeHostKey, resolveHostProfile } from "./host-profiles";
import { parseNaverVerification } from "./seo";
import type { Store } from "./types";

export type NaverMetaEntry = {
  host: string;
  naverSiteVerification: string;
};

export function bulkApplyNaverToHostProfiles(
  store: Store,
  entries: NaverMetaEntry[]
): { updated: number; skipped: number; notFound: string[] } {
  if (!store.hostProfiles) store.hostProfiles = {};
  let updated = 0;
  let skipped = 0;
  const notFound: string[] = [];

  for (const entry of entries) {
    const hostKey = normalizeHostKey(entry.host);
    const code = parseNaverVerification(entry.naverSiteVerification);
    if (!hostKey) {
      skipped += 1;
      continue;
    }
    if (!code) {
      skipped += 1;
      continue;
    }
    if (!resolveHostProfile(store, hostKey)) {
      notFound.push(hostKey);
      continue;
    }

    const aliasSet = new Set(hostProfileAliasKeys(hostKey).map((k) => normalizeHostKey(k)).filter(Boolean));
    aliasSet.add(hostKey);
    let touched = false;
    for (const key of Object.keys(store.hostProfiles)) {
      const nk = normalizeHostKey(key);
      if (!aliasSet.has(nk)) continue;
      const profile = store.hostProfiles[key];
      if (!profile) continue;
      profile.naverSiteVerification = code;
      profile.updatedAt = new Date().toISOString();
      store.hostProfiles[key] = profile;
      touched = true;
    }
    if (touched) updated += 1;
    else notFound.push(hostKey);
  }

  return { updated, skipped, notFound };
}
