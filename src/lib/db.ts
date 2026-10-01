import fs from "fs";
import path from "path";
import { seedBanners } from "./banners";
import { DEFAULT_GEMINI_MODEL } from "./gemini-models";
import { blobGetJson, blobSetJson, hasBlobStore } from "./blob-store";
import { hasRemoteStore, kvGetJson, kvSetJson } from "./kv";
import { adVendorToPartner } from "./ad-vendors";
import { seedAdVendors, seedPartners, seedPosts } from "./seed";
import { siteAccountFrom, DEFAULT_SITE_PASSWORD, DEFAULT_SITE_USERNAME } from "./site-account";
import { DEFAULT_WRITING_TONE, isWritingToneId, pickRandomWritingTone } from "./writing-tone";
import { DEFAULT_SITE_THEME, getSiteTheme, isSiteThemeId, pickRandomSiteTheme } from "./site-theme";
import { defaultBulkPublish, normalizeBulkPublish } from "./bulk-publish";
import { defaultMainLandingConfig, parseMainLandingConfig } from "./main-landing";
import { defaultHubPortalConfig, parseHubPortalConfig } from "./hub-portal";
import type { AdminPostRow, AdVendor, Banner, Category, Partner, Post, Settings, Store } from "./types";
import { DEFAULT_CATEGORIES, SITE, withFreeBoard } from "./categories";
import { decodeSlugParam } from "./slug";
import {
  DEFAULT_COMMENT_MAX,
  DEFAULT_COMMENT_MIN,
  DEFAULT_LIKE_MAX,
  DEFAULT_LIKE_MIN,
} from "./engagement";
import { parseNaverVerification } from "./seo";
import { pickFooterDisclaimer } from "./publish-disclaimer";
import { fallbackSiteTagline } from "./site-tagline";
import {
  getHostProfile,
  isKeywordSubdomainHost,
  mergeHostIntoSettings,
  normalizeHostKey,
  normalizeHostProfiles,
} from "./host-profiles";
import { toUnicode } from "node:punycode";
import { apexDomain, subdomainLabel } from "./ops-ledger";

function keywordSiteNameFromHost(host: string): string {
  const apex = apexDomain(host);
  const label = subdomainLabel(host, apex);
  if (!label || label === "@") return host.split(".")[0] || "";
  const segment = (label.split(".")[0] || label).trim();
  if (segment.toLowerCase().startsWith("xn--")) {
    try {
      return toUnicode(segment);
    } catch {
      return segment;
    }
  }
  return segment;
}
import { normalizeVendorGroups } from "./vendor-groups";

const LOCAL_PATH = path.join(process.cwd(), "data", "store.json");

function isBrandedCloneSite() {
  return Boolean(
    String(process.env.SITE_NAME || "").trim() || String(process.env.SITE_DOMAIN || "").trim()
  );
}

function defaultSettings(): Settings {
  const customName = String(process.env.SITE_NAME || "").trim();
  const branded = isBrandedCloneSite();
  return {
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    siteName: customName || SITE.name,
    siteTagline:
      String(process.env.SITE_TAGLINE || "").trim() ||
      (customName ? fallbackSiteTagline(customName, "env-seed") : "모든 생활 정보를 한눈에"),
    siteTheme: DEFAULT_SITE_THEME,
    carrotKeywords: "",
    popupEnabled: true,
    popupTitle: "지금 바로 시작해 보세요",
    popupBody: "필요한 이야기만 골라 읽고, 실생활에 바로 쓰는 가이드를 확인하세요.",
    popupCta: "글 보러가기",
    popupHref: "/posts",
    popupImage: "",
    likeCountMin: DEFAULT_LIKE_MIN,
    likeCountMax: DEFAULT_LIKE_MAX,
    commentCountMin: DEFAULT_COMMENT_MIN,
    commentCountMax: DEFAULT_COMMENT_MAX,
    footerDisclaimer: "",
    usableUntil: "",
    dailyPostLimit: 0,
    naverRankWork: false,
    naverSiteVerification: parseNaverVerification(process.env.NAVER_SITE_VERIFICATION) || "",
    extraImagesEnabled: true,
    vendorRegisterUrl: "",
    staffNoticeEnabled: false,
    staffNoticeTitle: "",
    staffNoticeBody: "",
    staffNoticeUpdatedAt: "",
    writingTone: DEFAULT_WRITING_TONE,
    writingPersona: "",
    siteUsername: DEFAULT_SITE_USERNAME,
    sitePassword: DEFAULT_SITE_PASSWORD,
    company: branded ? "" : SITE.company,
    ceo: branded ? "" : SITE.ceo,
    bizNo: branded ? "" : SITE.bizNo,
    address: branded ? "" : SITE.address,
    phone: "",
    email: branded ? "" : SITE.email,
    mainLanding: defaultMainLandingConfig(),
    hubPortal: defaultHubPortalConfig(),
  };
}

function defaultStore(): Store {
  const branded = isBrandedCloneSite();
  return JSON.parse(
    JSON.stringify({
      // Studio/clone sites start empty; hub/local demos keep sample posts.
      posts: branded ? [] : seedPosts,
      partners: seedPartners,
      adVendors: seedAdVendors,
      banners: seedBanners,
      categories: DEFAULT_CATEGORIES,
      settings: {
        ...defaultSettings(),
        writingTone: pickRandomWritingTone(),
        siteTheme: pickRandomSiteTheme(),
      },
      bulkPublish: defaultBulkPublish(),
    })
  ) as Store;
}

function normalize(parsed: Store): Store {
  parsed.posts ||= [];
  parsed.partners ||= [];
  parsed.adVendors = Array.isArray(parsed.adVendors) ? parsed.adVendors : [];
  if (shouldSeedDefaultVendors(parsed)) {
    parsed.adVendors = JSON.parse(JSON.stringify(seedAdVendors)) as AdVendor[];
    parsed.partners = JSON.parse(JSON.stringify(seedPartners)) as Partner[];
  }
  parsed.banners = parsed.banners?.length ? parsed.banners : seedBanners;
  parsed.categories = withFreeBoard(
    parsed.categories?.length ? parsed.categories : DEFAULT_CATEGORIES.map((c) => ({ ...c }))
  ).map((c) => ({
    ...c,
    geminiNotes: c.geminiNotes || "",
    vendorSlotCount: c.vendorSlotCount,
    vendorAds: Array.isArray(c.vendorAds) ? c.vendorAds : undefined,
    vendorRecruitSlot: Boolean(c.vendorRecruitSlot),
  }));
  parsed.settings = { ...defaultSettings(), ...parsed.settings };
  parsed.settings.mainLanding = parseMainLandingConfig(
    (parsed.settings as Settings).mainLanding ?? defaultMainLandingConfig()
  );
  parsed.settings.hubPortal = parseHubPortalConfig(
    (parsed.settings as Settings).hubPortal ?? defaultHubPortalConfig()
  );
  const account = siteAccountFrom(parsed.settings);
  parsed.settings.siteUsername = account.username;
  parsed.settings.sitePassword = account.password;
  parsed.settings.writingTone = isWritingToneId(parsed.settings.writingTone)
    ? parsed.settings.writingTone
    : DEFAULT_WRITING_TONE;
  parsed.settings.writingPersona = String(parsed.settings.writingPersona || "");
  const footer = String(parsed.settings.footerDisclaimer || "").trim();
  if (!footer) {
    const seed = [
      parsed.settings.siteName,
      parsed.settings.siteTagline,
      process.env.SITE_DOMAIN || process.env.NEXT_PUBLIC_SITE_DOMAIN || process.env.VERCEL_PROJECT_PRODUCTION_URL || "",
    ]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join("|");
    parsed.settings.footerDisclaimer = pickFooterDisclaimer(seed || parsed.settings.siteName || "magazine");
  } else {
    parsed.settings.footerDisclaimer = footer;
  }
  if (!String(parsed.settings.naverSiteVerification || "").trim()) {
    const fromEnv = parseNaverVerification(process.env.NAVER_SITE_VERIFICATION);
    if (fromEnv) parsed.settings.naverSiteVerification = fromEnv;
  } else {
    parsed.settings.naverSiteVerification = parseNaverVerification(parsed.settings.naverSiteVerification);
  }
  if (!(Number(parsed.settings.likeCountMax) > 0)) {
    parsed.settings.likeCountMin = DEFAULT_LIKE_MIN;
    parsed.settings.likeCountMax = DEFAULT_LIKE_MAX;
  }
  if (!(Number(parsed.settings.commentCountMax) > 0)) {
    parsed.settings.commentCountMin = DEFAULT_COMMENT_MIN;
    parsed.settings.commentCountMax = DEFAULT_COMMENT_MAX;
  }
  parsed.bulkPublish = normalizeBulkPublish(parsed.bulkPublish);
  parsed.hostProfiles = normalizeHostProfiles(parsed.hostProfiles);
  parsed.vendorGroups = normalizeVendorGroups(parsed.vendorGroups);
  return parsed;
}

function writeFileStore(store: Store) {
  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(store, null, 2), "utf8");
}

export class PersistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistError";
  }
}

async function loadStore(): Promise<Store> {
  const building = process.env.NEXT_PHASE === "phase-production-build";
  if (hasBlobStore()) {
    let remote: Store | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      remote = await blobGetJson<Store>();
      if (remote) break;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 150));
    }
    if (remote) return persistSeededVendors(remote, building, (store) => blobSetJson(store));
    const initial = defaultStore();
    if (building) return initial;
    // 빈 Blob일 때 여기서 바로 기본값을 쓰면, 동시 부트스트랩(메인랜딩 ON)과
    // 경쟁해 설정을 덮어쓸 수 있다. 첫 저장은 updateStore(부트스트랩 등)에 맡긴다.
    return initial;
  }
  if (hasRemoteStore()) {
    const remote = await kvGetJson<Store>();
    if (remote) return persistSeededVendors(remote, building, (store) => kvSetJson(store));
    // Blob과 동일: 빈 저장소 선기록은 부트스트랩과 경쟁하므로 하지 않음
    return defaultStore();
  }
  if (!fs.existsSync(LOCAL_PATH)) return defaultStore();
  try {
    const raw = JSON.parse(fs.readFileSync(LOCAL_PATH, "utf8")) as Store;
    return persistSeededVendors(raw, false, async (store) => writeFileStore(store));
  } catch {
    return defaultStore();
  }
}

async function persistSeededVendors(
  raw: Store,
  building: boolean,
  persist: (store: Store) => Promise<void> | void
) {
  const hadVendors = Array.isArray(raw.adVendors) && raw.adVendors.length > 0;
  const next = normalize(raw);
  if (!building && !hadVendors && next.adVendors.length) {
    try {
      await persist(next);
    } catch {
      return next;
    }
  }
  return next;
}

async function saveStore(store: Store) {
  try {
    if (hasBlobStore()) {
      await blobSetJson(store);
      return;
    }
    if (hasRemoteStore()) {
      await kvSetJson(store);
      return;
    }
    if (process.env.VERCEL) {
      throw new PersistError(
        "Vercel Storage에서 Blob을 만든 뒤 mginfo에 연결하고 다시 배포하세요. Browse Stores 검색창에 Blob을 입력하면 나옵니다."
      );
    }
    writeFileStore(store);
  } catch (err) {
    if (err instanceof PersistError) throw err;
    throw new PersistError(err instanceof Error ? err.message : "글을 저장하지 못했습니다.");
  }
}

let queue: Promise<unknown> = Promise.resolve();

export function persistenceReady(): boolean {
  if (hasBlobStore() || hasRemoteStore()) return true;
  return !process.env.VERCEL;
}

export async function readStore(): Promise<Store> {
  return loadStore();
}

export async function updateStore(mutator: (store: Store) => void): Promise<Store> {
  const run = queue.then(async () => {
    const store = await loadStore();
    mutator(store);
    await saveStore(store);
    return store;
  });
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function getPublishedPosts(): Promise<Post[]> {
  const store = await readStore();
  return store.posts
    .filter((p) => p.status === "published")
    .sort((a, b) => (b.publishedAt || b.createdAt).localeCompare(a.publishedAt || a.createdAt));
}

export async function getPostBySlug(slug: string): Promise<Post | undefined> {
  const store = await readStore();
  const wanted = decodeSlugParam(slug);
  return store.posts.find((p) => decodeSlugParam(p.slug) === wanted);
}

export async function getPostById(id: string): Promise<Post | undefined> {
  const store = await readStore();
  return store.posts.find((p) => p.id === id);
}

export const ADMIN_POSTS_PAGE_SIZE = 25;

function toAdminPostRow(post: Post): AdminPostRow {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    category: post.category,
    status: post.status,
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
  };
}

export async function listAdminPosts(opts: { page?: number; category?: string } = {}) {
  const store = await readStore();
  const pageSize = ADMIN_POSTS_PAGE_SIZE;
  const category = (opts.category || "").trim();
  const sorted = store.posts
    .slice()
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
  const filtered = category ? sorted.filter((p) => p.category === category) : sorted;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const page = Math.min(Math.max(1, opts.page || 1), totalPages);
  const start = (page - 1) * pageSize;
  const counts: Record<string, number> = {};
  for (const post of store.posts) {
    counts[post.category] = (counts[post.category] || 0) + 1;
  }
  return {
    posts: filtered.slice(start, start + pageSize).map(toAdminPostRow),
    total,
    page,
    pageSize,
    totalPages,
    categories: withFreeBoard(store.categories),
    counts,
    allCount: store.posts.length,
  };
}

function shufflePartners(list: Partner[]): Partner[] {
  const next = list.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = next[i];
    next[i] = next[j];
    next[j] = current;
  }
  return next;
}

export async function getPartners(): Promise<Partner[]> {
  const store = await readStore();
  const list = store.adVendors?.length ? store.adVendors.map(adVendorToPartner) : store.partners;
  return shufflePartners(list);
}

function shouldSeedDefaultVendors(store: Store) {
  if (store.adVendors.length) return false;
  if (!store.partners.length) return true;
  const recruiting = store.partners.filter((row) => row.name === "파트너 모집").length;
  const oldSeedIds = store.partners.every((row) => /^p[1-5]$/.test(row.id));
  return recruiting >= 2 || oldSeedIds;
}

export async function getSettings(): Promise<Settings> {
  return (await readStore()).settings;
}

/** Global settings merged with per-host profile (home / SEO for that domain). */
export async function getSettingsForRequestHost(requestHost?: string): Promise<Settings> {
  const store = await readStore();
  const host = normalizeHostKey(String(requestHost || ""));
  if (!host) return store.settings;
  const profile = getHostProfile(store, host);
  if (profile) return mergeHostIntoSettings(store.settings, profile);
  if (isKeywordSubdomainHost(host)) {
    const fallbackName = keywordSiteNameFromHost(host) || store.settings.siteName;
    return mergeHostIntoSettings(store.settings, {
      siteName: fallbackName,
      mainLanding: parseMainLandingConfig({ enabled: false }),
    });
  }
  return store.settings;
}

export async function getCategories(): Promise<Category[]> {
  const store = await readStore();
  return withFreeBoard(store.categories);
}

export async function getBanners(): Promise<Banner[]> {
  return (await readStore()).banners || [];
}

export async function getAdVendors(): Promise<AdVendor[]> {
  return (await readStore()).adVendors || [];
}

export async function getEnabledBanners(): Promise<Banner[]> {
  const banners = await getBanners();
  return banners.filter((b) => b.enabled);
}

export async function resolveSiteTheme() {
  const settings = await getSettings();
  return getSiteTheme(isSiteThemeId(settings.siteTheme) ? settings.siteTheme : DEFAULT_SITE_THEME);
}
