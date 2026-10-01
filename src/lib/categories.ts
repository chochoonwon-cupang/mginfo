import type { Category, Settings } from "./types";
import { fallbackSiteTagline, isBlandSiteTagline } from "./site-tagline";
import { slugify } from "./slug";

export const CATEGORY_COLORS = [
  "#f59e0b",
  "#ec4899",
  "#3b82f6",
  "#8b5cf6",
  "#2563eb",
  "#ef4444",
  "#ea580c",
  "#10b981",
  "#14b8a6",
  "#6366f1",
];

export const FREE_BOARD_SLUG = "free";

export const FREE_BOARD_CATEGORY: Category = {
  slug: FREE_BOARD_SLUG,
  name: "자유게시판",
  filterClass: "g-free",
  color: "#64748b",
};

export const DEFAULT_CATEGORIES: Category[] = [
  { slug: "pets", name: "반려동물", filterClass: "g-pets", color: "#f59e0b" },
  { slug: "beauty", name: "뷰티", filterClass: "g-beauty", color: "#ec4899" },
  { slug: "interior", name: "인테리어/철거", filterClass: "g-interior", color: "#3b82f6" },
  { slug: "realestate", name: "부동산", filterClass: "g-realestate", color: "#8b5cf6" },
  { slug: "ads", name: "온리인광고", filterClass: "g-ads", color: "#2563eb" },
  { slug: "food", name: "맛집", filterClass: "g-food", color: "#ef4444" },
  { slug: "cooking", name: "요리", filterClass: "g-cooking", color: "#ea580c" },
  { slug: "life", name: "라이프", filterClass: "g-life", color: "#10b981" },
  { ...FREE_BOARD_CATEGORY },
];

export const CATEGORIES = DEFAULT_CATEGORIES;

export function getCategory(slug: string, categories: Category[] = DEFAULT_CATEGORIES): Category | undefined {
  return categories.find((c) => c.slug === slug);
}

export function getCategoryByName(name: string, categories: Category[] = DEFAULT_CATEGORIES): Category | undefined {
  return categories.find((c) => c.name === name);
}

export function ensureCategorySlug(slug: unknown, categories: Category[], fallback = "life"): string {
  if (typeof slug === "string" && categories.some((c) => c.slug === slug)) return slug;
  if (categories.some((c) => c.slug === fallback)) return fallback;
  return categories[0]?.slug || fallback;
}

export function withFreeBoard(categories: Category[] = []): Category[] {
  const others = (Array.isArray(categories) ? categories : []).filter((c) => c.slug !== FREE_BOARD_SLUG);
  const found = (Array.isArray(categories) ? categories : []).find((c) => c.slug === FREE_BOARD_SLUG);
  return [
    ...others,
    {
      ...FREE_BOARD_CATEGORY,
      color: found?.color || FREE_BOARD_CATEGORY.color,
      filterClass: found?.filterClass || FREE_BOARD_CATEGORY.filterClass,
      geminiNotes: found?.geminiNotes || "",
      vendorSlotCount: found?.vendorSlotCount,
      vendorAds: found?.vendorAds,
      vendorRecruitSlot: found?.vendorRecruitSlot,
    },
  ];
}

export function isFreeBoardSlug(slug: string) {
  return slug === FREE_BOARD_SLUG;
}

export function displaySiteName(name?: string) {
  return (name || "").trim() || SITE.name;
}

export function siteBrand(settings?: Pick<Settings, "siteName" | "siteTagline"> | null) {
  const name = displaySiteName(settings?.siteName);
  const raw = String(settings?.siteTagline || "").trim();
  const tagline = isBlandSiteTagline(raw) ? fallbackSiteTagline(name, "siteBrand") : raw || SITE.tagline;
  const description = tagline.startsWith(name) ? tagline : `${name}. ${tagline}`;
  return { name, tagline, description };
}

export function footerBizLines(biz: Pick<Settings, "company" | "ceo" | "bizNo" | "address" | "phone" | "email">) {
  const line1 = [
    biz.company && `상호: ${biz.company}`,
    biz.ceo && `대표: ${biz.ceo}`,
    biz.bizNo && `사업자등록번호: ${biz.bizNo}`,
  ].filter(Boolean) as string[];
  const line2 = [
    biz.address && `주소: ${biz.address}`,
    biz.phone && `연락처: ${biz.phone}`,
    biz.email && `Email: ${biz.email}`,
  ].filter(Boolean) as string[];
  return [line1.join(" | "), line2.join(" | ")].filter(Boolean);
}

export function makeCategory(name: string, existing: Category[], geminiNotes = ""): Category {
  const label = name.trim();
  const notes = geminiNotes.trim();
  const base = slugify(label);
  let slug = base === FREE_BOARD_SLUG ? `${base}-2` : base;
  let n = slug === base ? 2 : 3;
  while (existing.some((c) => c.slug === slug) || slug === FREE_BOARD_SLUG) {
    slug = `${base}-${n}`;
    n += 1;
  }
  const color = CATEGORY_COLORS[existing.length % CATEGORY_COLORS.length];
  const safe = slug.replace(/[^a-z0-9-]/gi, "").slice(0, 24) || "custom";
  return { slug, name: label, color, filterClass: `g-${safe}`, geminiNotes: notes };
}

export function parseCarrotKeywords(raw?: string) {
  return (raw || "")
    .split(/[\n,]/)
    .map((word) => word.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export const SITE = {
  name: "infocs 매거진",
  english: "infocs magazine",
  domain: "magazine.infocs.co.kr",
  tagline: "Curated Life & Trend",
  titleLine: "Curated Life & Trend, 매거진",
  description: "깊이 있는 이야기와 실생활에 유용한 가이드를 전합니다.",
  company: "주식회사 인포씨에스",
  ceo: "조춘원",
  bizNo: "224-87-00683",
  address: "경기 부천시 길주로 246",
  email: "info@infocs.co.kr",
};
