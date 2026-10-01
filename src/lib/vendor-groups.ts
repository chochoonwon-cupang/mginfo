import { resolveVendorAddress } from "./main-landing/auto-address";
import type { MainLandingVendor } from "./main-landing/types";

export type VendorGroupRecord = {
  id: string;
  label: string;
  /** 키워드에 포함되면 이 그룹 업체 적용 (예: 부천, 시흥) */
  regions: string[];
  name: string;
  phone: string;
  address: string;
  businessNumber: string;
  kakao: string;
  email: string;
  ceo: string;
};

export function normalizeVendorGroups(raw: unknown): VendorGroupRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: VendorGroupRecord[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const regions = Array.isArray(r.regions)
      ? r.regions.map((x) => String(x || "").trim()).filter(Boolean)
      : String(r.regions || "")
          .split(/[,，|\n]+/)
          .map((x) => x.trim())
          .filter(Boolean);
    const id = String(r.id || r.label || regions[0] || "").trim() || `g-${out.length + 1}`;
    const label = String(r.label || id).trim();
    if (!regions.length && !String(r.name || "").trim()) continue;
    out.push({
      id,
      label,
      regions,
      name: String(r.name || "").trim(),
      phone: String(r.phone || "").trim(),
      address: String(r.address || "").trim(),
      businessNumber: String(r.businessNumber || r.bizNo || "").trim(),
      kakao: String(r.kakao || "").trim(),
      email: String(r.email || "").trim(),
      ceo: String(r.ceo || "").trim(),
    });
  }
  return out;
}

export function matchVendorGroup(keyword: string, groups: VendorGroupRecord[]): VendorGroupRecord | null {
  const kw = String(keyword || "").trim();
  if (!kw || !groups.length) return null;
  for (const group of groups) {
    for (const token of group.regions) {
      if (token && kw.includes(token)) return group;
    }
  }
  return null;
}

export function applyVendorGroup(
  keyword: string,
  base: MainLandingVendor,
  groups: VendorGroupRecord[]
): { vendor: MainLandingVendor; groupId: string | null } {
  const hit = matchVendorGroup(keyword, groups);
  if (!hit) return { vendor: base, groupId: null };
  const address = resolveVendorAddress({
    address: hit.address || base.address,
    keyword,
    name: hit.name || base.name,
  });
  return {
    groupId: hit.id,
    vendor: {
      ...base,
      name: hit.name || base.name,
      phone: hit.phone || base.phone,
      address,
      businessNumber: hit.businessNumber || base.businessNumber,
      kakao: hit.kakao || base.kakao,
      region: hit.regions[0] || base.region,
    },
  };
}

/** Brand Studio textarea: blocks separated by --- */
export function parseVendorGroupsText(raw: string): VendorGroupRecord[] {
  const blocks = String(raw || "")
    .split(/\n---+\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (!blocks.length && String(raw || "").trim()) blocks.push(String(raw).trim());

  const groups: VendorGroupRecord[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim());
    const row: Record<string, string> = { regions: "" };
    for (const line of lines) {
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf(":");
      if (idx < 1) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const val = line.slice(idx + 1).trim();
      if (key === "label" || key === "이름" || key === "그룹") row.label = val;
      else if (key === "regions" || key === "지역" || key === "키워드") row.regions = val;
      else if (key === "name" || key === "업체명") row.name = val;
      else if (key === "phone" || key === "전화") row.phone = val;
      else if (key === "address" || key === "주소") row.address = val;
      else if (key === "bizno" || key === "사업자") row.businessNumber = val;
      else if (key === "kakao" || key === "카카오") row.kakao = val;
      else if (key === "email" || key === "이메일") row.email = val;
      else if (key === "ceo" || key === "대표") row.ceo = val;
    }
    const regions = row.regions
      .split(/[,，|]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    const id = row.label || regions[0] || `g-${groups.length + 1}`;
    if (!regions.length && !row.name) continue;
    groups.push({
      id,
      label: row.label || id,
      regions,
      name: row.name || "",
      phone: row.phone || "",
      address: row.address || "",
      businessNumber: row.businessNumber || "",
      kakao: row.kakao || "",
      email: row.email || "",
      ceo: row.ceo || "",
    });
  }
  return groups;
}

export function formatVendorGroupsText(groups: VendorGroupRecord[]): string {
  return groups
    .map((g) => {
      const lines = [
        `label: ${g.label || g.id}`,
        `regions: ${g.regions.join(", ")}`,
        g.name ? `name: ${g.name}` : "",
        g.phone ? `phone: ${g.phone}` : "",
        g.address ? `address: ${g.address}` : "",
        g.businessNumber ? `bizNo: ${g.businessNumber}` : "",
        g.kakao ? `kakao: ${g.kakao}` : "",
        g.email ? `email: ${g.email}` : "",
        g.ceo ? `ceo: ${g.ceo}` : "",
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n---\n");
}
