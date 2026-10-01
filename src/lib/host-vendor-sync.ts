import { parseMainLandingConfig } from "./main-landing";
import { emptyMainLandingVendor } from "./main-landing";
import type { HostSiteProfile, Store } from "./types";
import { applyVendorGroup, normalizeVendorGroups, type VendorGroupRecord } from "./vendor-groups";

export function refreshHostProfilesVendorGroups(store: Store, groups?: VendorGroupRecord[]) {
  const list = groups ?? normalizeVendorGroups(store.vendorGroups);
  if (!list.length || !store.hostProfiles) return 0;
  let n = 0;
  for (const [host, profile] of Object.entries(store.hostProfiles)) {
    const keyword = String(profile.siteName || profile.mainLanding?.vendor?.keyword || "").trim();
    if (!keyword) continue;
    const base = profile.mainLanding?.vendor || emptyMainLandingVendor();
    const { vendor, groupId } = applyVendorGroup(keyword, base, list);
    if (!groupId) continue;
    profile.vendorGroupId = groupId;
    profile.company = vendor.name || profile.company;
    profile.phone = vendor.phone || profile.phone;
    profile.address = vendor.address || profile.address;
    profile.bizNo = vendor.businessNumber || profile.bizNo;
    profile.mainLanding = parseMainLandingConfig({
      ...profile.mainLanding,
      vendor: { ...vendor, keyword },
    });
    profile.updatedAt = new Date().toISOString();
    store.hostProfiles[host] = profile;
    n += 1;
  }
  return n;
}

export function mergeBootstrapVendor(
  keyword: string,
  vendor: Record<string, unknown>,
  groups: VendorGroupRecord[]
) {
  const base = {
    ...emptyMainLandingVendor(),
    name: String(vendor.name || "").trim(),
    keyword: String(vendor.keyword || keyword).trim(),
    phone: String(vendor.phone || "").trim(),
    address: String(vendor.address || "").trim(),
    businessNumber: String(vendor.businessNumber || "").trim(),
    kakao: String(vendor.kakao || "").trim(),
    industry: String(vendor.industry || "").trim(),
    region: String(vendor.region || "").trim(),
    intro: String(vendor.intro || "").trim(),
    website: String(vendor.website || "").trim(),
    strengths: String(vendor.strengths || "").trim(),
  };
  return applyVendorGroup(keyword, base, groups);
}
