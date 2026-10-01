/** Region keyword → vendor (matches src/lib/vendor-groups.ts). */

const { resolveVendorAddress } = require("./auto-address");

function normalizeVendorGroupsFromStudio(raw) {
  if (!Array.isArray(raw)) return [];
  const groups = [];
  for (let i = 0; i < raw.length; i += 1) {
    const g = raw[i] || {};
    const regions = String(g.regions || "")
      .split(/[,，|\n]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    const label = String(g.label || "").trim();
    const id = label || regions[0] || `g-${groups.length + 1}`;
    if (!regions.length && !String(g.name || "").trim()) continue;
    groups.push({
      id,
      label: label || id,
      regions,
      name: String(g.name || "").trim(),
      phone: String(g.phone || "").trim(),
      address: String(g.address || "").trim(),
      businessNumber: String(g.businessNumber || g.bizNo || "").trim(),
      kakao: String(g.kakao || "").trim(),
      email: String(g.email || "").trim(),
      ceo: String(g.ceo || "").trim(),
    });
  }
  return groups;
}

function resolveVendorGroupsFromPayload(payload) {
  const fromForm = normalizeVendorGroupsFromStudio(payload?.vendorGroups);
  if (fromForm.length) return fromForm;
  return parseVendorGroupsText(String(payload?.vendorGroupsText || ""));
}

function parseVendorGroupsText(raw) {
  const blocks = String(raw || "")
    .split(/\n---+\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (!blocks.length && String(raw || "").trim()) blocks.push(String(raw).trim());
  const groups = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim());
    const row = { regions: "" };
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

function matchVendorGroup(keyword, groups) {
  const kw = String(keyword || "").trim();
  if (!kw || !groups.length) return null;
  for (const group of groups) {
    for (const token of group.regions) {
      if (token && kw.includes(token)) return group;
    }
  }
  return null;
}

function applyVendorGroupToPayload(keyword, vendor, groups) {
  const hit = matchVendorGroup(keyword, groups);
  if (!hit) return { vendor, groupId: null };
  const address = resolveVendorAddress({
    address: hit.address || vendor.address,
    keyword,
    name: hit.name || vendor.name,
  });
  return {
    groupId: hit.id,
    vendor: {
      ...vendor,
      name: hit.name || vendor.name,
      phone: hit.phone || vendor.phone,
      address,
      businessNumber: hit.businessNumber || vendor.businessNumber,
      kakao: hit.kakao || vendor.kakao,
    },
  };
}

const { sortStudioApiBases, studioAuthHeaders, mergeHeaders } = require("./http-client");

async function syncVendorGroups(urls, groups, masterPassword, onLog = () => {}, opts = {}) {
  if (!groups.length) return false;
  const secret = String(masterPassword || "").trim();
  if (!secret) return false;
  const base = sortStudioApiBases(urls)[0];
  if (!base) return false;
  const auth = studioAuthHeaders({ masterPassword: secret, bypassSecret: opts.bypassSecret });
  try {
    const res = await fetch(`${base}/api/brand-studio/vendor-groups`, {
      method: "POST",
      headers: mergeHeaders({ "Content-Type": "application/json" }, auth),
      body: JSON.stringify({ vendorGroups: groups, apply: true }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      onLog(`업체 그룹 동기화 실패 (${res.status})`);
      return false;
    }
    const data = await res.json().catch(() => ({}));
    onLog(`업체 그룹 ${data.count || groups.length}개 저장 · ${data.hostsUpdated || 0}개 도메인 반영`);
    return true;
  } catch (err) {
    onLog(`업체 그룹 동기화: ${err.message || err}`);
    return false;
  }
}

module.exports = {
  parseVendorGroupsText,
  normalizeVendorGroupsFromStudio,
  resolveVendorGroupsFromPayload,
  applyVendorGroupToPayload,
  syncVendorGroups,
};
