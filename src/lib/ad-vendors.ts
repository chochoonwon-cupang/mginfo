import { normalizeHttpUrl, normalizePhone } from "./vendor";
import { absolutizeMediaUrl, HUB_MEDIA_ORIGIN, publicVendorImageUrl } from "./media-url";
import type { AdVendor, Partner } from "./types";
import { uid } from "./slug";
import { parseYoutubeUrlPair } from "./youtube";

function trimOrUndef(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

export function parseAdVendor(body: Record<string, unknown>, current?: AdVendor): AdVendor | { error: string } {
  const name = String(body.name ?? current?.name ?? "").trim();
  if (!name) return { error: "업체명을 입력하세요." };
  const now = new Date().toISOString();
  const youtube = parseYoutubeUrlPair(body, current);
  return {
    id: current?.id || uid(),
    name,
    category: body.category !== undefined ? trimOrUndef(body.category) : current?.category,
    intro: body.intro !== undefined ? trimOrUndef(body.intro) : current?.intro,
    phone: body.phone !== undefined ? normalizePhone(body.phone) : current?.phone,
    website: body.website !== undefined ? normalizeHttpUrl(body.website) : current?.website,
    kakao: body.kakao !== undefined ? normalizeHttpUrl(body.kakao) : current?.kakao,
    bizNo: body.bizNo !== undefined ? trimOrUndef(body.bizNo) : current?.bizNo,
    address: body.address !== undefined ? trimOrUndef(body.address) : current?.address,
    notes: body.notes !== undefined ? trimOrUndef(body.notes) : current?.notes,
    imageUrl:
      body.imageUrl !== undefined
        ? absolutizeMediaUrl(trimOrUndef(body.imageUrl), HUB_MEDIA_ORIGIN) || undefined
        : current?.imageUrl,
    youtubeUrl1: youtube.youtubeUrl1,
    youtubeUrl2: youtube.youtubeUrl2,
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };
}

export function adVendorToPartner(vendor: AdVendor): Partner {
  return {
    id: vendor.id,
    name: vendor.name,
    category: vendor.category || "제휴",
    intro: vendor.intro || vendor.website || "",
    url: vendor.website,
    phone: vendor.phone,
    imageUrl: publicVendorImageUrl(vendor.imageUrl) || vendor.imageUrl,
  };
}

export function vendorFieldsFromAd(vendor: AdVendor) {
  return {
    vendorId: vendor.id,
    vendorName: vendor.name || "",
    vendorPhone: vendor.phone || "",
    vendorWebsite: vendor.website || "",
    vendorKakao: vendor.kakao || "",
    youtubeUrl1: vendor.youtubeUrl1 || "",
    youtubeUrl2: vendor.youtubeUrl2 || "",
    vendorBizNo: vendor.bizNo || "",
    vendorAddress: vendor.address || "",
  };
}

/** Hub → clone payload: keep the hub id so listingVendorsForPost can resolve it. */
export function adVendorSnapshot(vendor: AdVendor): Record<string, unknown> {
  return {
    id: vendor.id,
    name: vendor.name,
    category: vendor.category || "",
    intro: vendor.intro || "",
    phone: vendor.phone || "",
    website: vendor.website || "",
    kakao: vendor.kakao || "",
    bizNo: vendor.bizNo || "",
    address: vendor.address || "",
    notes: vendor.notes || "",
    imageUrl: absolutizeMediaUrl(vendor.imageUrl, HUB_MEDIA_ORIGIN),
    youtubeUrl1: vendor.youtubeUrl1 || "",
    youtubeUrl2: vendor.youtubeUrl2 || "",
    createdAt: vendor.createdAt || "",
    updatedAt: vendor.updatedAt || "",
  };
}

export function parseAdVendorSnapshots(raw: unknown): AdVendor[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  const out: AdVendor[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id || "").trim();
    const name = String(row.name || "").trim();
    if (!id || !name || seen.has(id)) continue;
    const stub: AdVendor = {
      id,
      name,
      createdAt: String(row.createdAt || "").trim() || new Date().toISOString(),
      updatedAt: String(row.updatedAt || "").trim() || new Date().toISOString(),
    };
    const parsed = parseAdVendor(row, stub);
    if ("error" in parsed) continue;
    out.push({ ...parsed, id });
    seen.add(id);
  }
  return out;
}

export function upsertAdVendors(existing: AdVendor[], incoming: AdVendor[]): AdVendor[] {
  if (!incoming.length) return existing;
  const map = new Map(existing.map((row) => [row.id, row]));
  const now = new Date().toISOString();
  for (const next of incoming) {
    const prev = map.get(next.id);
    map.set(next.id, {
      ...(prev || {}),
      ...next,
      id: next.id,
      createdAt: prev?.createdAt || next.createdAt || now,
      updatedAt: now,
    });
  }
  return Array.from(map.values());
}
