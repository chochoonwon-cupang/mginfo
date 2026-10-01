import type { AdVendor, Category, Post } from "./types";
import { publicVendorImageUrl } from "./media-url";
import { seedNumber } from "./region-intro";
import { categoryAdsConfigured, categoryListingVendors, DEFAULT_VENDOR_SLOTS } from "./category-vendor-ads";

export { DEFAULT_VENDOR_SLOTS };
export const MAX_LISTING_VENDORS = 5;

export function parseVendorIds(raw: unknown, fallback?: string): string[] {
  const incoming = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of [...incoming, fallback || ""]) {
    const id = String(item || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_LISTING_VENDORS) break;
  }
  return out;
}

export function postPhotoUrls(post: Pick<Post, "coverImage" | "extraImages">): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const url of [post.coverImage, ...(post.extraImages || []).map((item) => item.url)]) {
    const next = String(url || "").trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    urls.push(next);
  }
  return urls;
}

export function postAssignedVendorIds(post: Pick<Post, "vendorIds" | "vendorId">): string[] {
  return parseVendorIds(post.vendorIds, post.vendorId);
}

export function postHasAssignedVendors(post: Pick<Post, "vendorIds" | "vendorId">): boolean {
  return postAssignedVendorIds(post).length > 0;
}

function vendorsFromIds(ids: string[], vendors: AdVendor[]): AdVendor[] {
  const rows: AdVendor[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const vendor = vendors.find((row) => row.id === id);
    if (!vendor || seen.has(vendor.id)) continue;
    seen.add(vendor.id);
    rows.push(vendor);
  }
  return rows;
}

export function listingVendorsForPost(post: Post, vendors: AdVendor[], category?: Category | null): AdVendor[] {
  const assigned = postAssignedVendorIds(post);
  if (assigned.length) return vendorsFromIds(assigned, vendors);
  if (categoryAdsConfigured(category)) {
    return categoryListingVendors(post, vendors, category);
  }
  return [];
}

/** 카테고리/지정 업체가 없어도 글에 업체명이 있으면 제휴 카드로 노출 */
export function listingVendorsOrPostFallback(
  post: Post,
  vendors: AdVendor[],
  category?: Category | null
): AdVendor[] {
  const listed = listingVendorsForPost(post, vendors, category);
  if (listed.length) return listed;
  const name = String(post.vendorName || "").trim();
  if (!name) return [];
  const matched =
    vendors.find((row) => row.name.trim() === name) ||
    vendors.find((row) => name.includes(row.name.trim()) || row.name.trim().includes(name.split(/\s+/)[0] || name));
  const now = post.updatedAt || post.createdAt || new Date().toISOString();
  return [
    {
      id: post.vendorId || matched?.id || `inline-${post.id}`,
      name,
      category: matched?.category || "제휴",
      intro: matched?.intro,
      phone: post.vendorPhone || matched?.phone,
      website: post.vendorWebsite || matched?.website,
      kakao: post.vendorKakao || matched?.kakao,
      imageUrl: matched?.imageUrl || post.coverImage,
      youtubeUrl1: matched?.youtubeUrl1,
      youtubeUrl2: matched?.youtubeUrl2,
      bizNo: post.vendorBizNo || matched?.bizNo,
      address: post.vendorAddress || matched?.address,
      createdAt: matched?.createdAt || now,
      updatedAt: matched?.updatedAt || now,
    },
  ];
}

export function pickVisibleVendors(pool: AdVendor[], limit: number, seed: number) {
  return shuffleVendors(pool, seed || 1).slice(0, Math.max(0, limit));
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleVendors<T>(items: T[], seed: number): T[] {
  const next = [...items];
  const rand = mulberry32(seed || 1);
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function listingOrderSeed(keyword: string, postId?: string) {
  return seedNumber(keyword, postId, String(Date.now()), String(Math.random()));
}

function hasBatchim(word: string) {
  const ch = word.replace(/\s+/g, "").slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function eulReul(word: string) {
  return hasBatchim(word) ? "을" : "를";
}

export function vendorAdHeadline(keyword: string, seed: number) {
  const kw = keyword.trim() || "이 키워드";
  const lines = [
    `${kw} 관련해 함께 알아보면 좋은 업체 안내입니다.`,
    `${kw}${eulReul(kw)} 찾는 분들이 참고하는 업체 정보입니다.`,
    `${kw}로 알아보는 분들이 많아, 아래 업체도 함께 확인해 보세요.`,
    `${kw}, 방문 전에 같이 보면 좋은 업체 안내입니다.`,
  ];
  return lines[Math.abs(seed) % lines.length];
}

export function vendorCardPhoto(vendor: AdVendor) {
  return publicVendorImageUrl(vendor.imageUrl);
}

export function vendorCardIntro(vendor: AdVendor, keyword: string) {
  const intro = (vendor.intro || "").trim();
  if (intro) return intro;
  const kw = keyword.trim() || "이 주제";
  const name = (vendor.name || "").trim() || "안내 업체";
  return `${kw}를 알아보실 때 함께 참고해 보세요. 조건은 ${name}에 확인해 주세요.`;
}
