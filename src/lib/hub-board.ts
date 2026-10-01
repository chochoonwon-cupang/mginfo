import { resolveArticleStyle } from "./article-style";
import { parseKeywordList } from "./bulk-keywords";
import { parseFaqItems } from "./faq";
import { FREE_BOARD_SLUG } from "./categories";
import { generateArticle } from "./gemini";
import { DEFAULT_GEMINI_MODEL } from "./gemini-models";
import { bannedContentError, collectPublishText } from "./banned-keywords";
import { resolveGeminiNotes } from "./gemini-notes";
import type { OpsSite } from "./ops-ledger";
import { siteRequestOrigin } from "./site-origin";
import { canClaimDueKeyword } from "./publish-claim";
import { seoulDateKey } from "./publish-limits";
import { extractPlaceName, parseNameList } from "./region-geo";
import { cleanHtml } from "./sanitize";
import { articleSlug, slugify, uid } from "./slug";
import { collectTodayKeywords, uniqueTextList, withUniqueArticle } from "./title-uniqueness";
import type { Post, Settings } from "./types";
import { normalizeHttpUrl, parseVendorFields } from "./vendor";
import { parseYoutubeUrlPair, preferYoutubePair } from "./youtube";
import { ensureVendorSlots } from "./vendor-slots";
import { pickRandomPostImages, mergeImageUrls } from "./image-pool";
import { discoverWebFolderImages } from "./web-image-folder";
import { renderHubBoardTemplateArticle } from "./hub-board-templates";

/** Spread publish times evenly across [start, end]. Avoids midnight pile-up. */
function evenPublishSlots(count: number, start: Date, end: Date): Date[] {
  if (count <= 0) return [];
  const startMs = start.getTime();
  const endMs = Math.max(startMs + 60_000, end.getTime());
  const span = endMs - startMs;
  if (count === 1) {
    return [new Date(startMs + Math.floor(span / 2))];
  }
  const slots: Date[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = startMs + Math.floor(((i + 0.5) / count) * span);
    slots.push(new Date(Math.min(endMs - 1_000, Math.max(startMs, t))));
  }
  return slots;
}

export type HubBoardResult = {
  siteId: string;
  domain: string;
  ok: boolean;
  error?: string;
  postId?: string;
};

export type HubBoardKeyword = {
  id: string;
  keyword: string;
  status: "queued" | "scheduled" | "processing" | "published" | "failed";
  siteId?: string;
  domain?: string;
  postId?: string;
  scheduledAt?: string;
  publishedAt?: string;
  processingAt?: string;
  processingClaim?: string;
  error?: string;
  title?: string;
  youtubeUrl1?: string;
  youtubeUrl2?: string;
};

export type HubBoardSchedule = {
  enabled: boolean;
  startHour: number;
  endHour: number;
  planDate: string;
};

export type HubBoardContentMode = "gemini" | "template";

export type HubBoardCampaign = {
  id: string;
  title: string;
  vendorName?: string;
  vendorPhone?: string;
  vendorWebsite?: string;
  vendorKakao?: string;
  vendorId?: string;
  vendorIds?: string[];
  writingStyle: string;
  /** gemini = LLM 작성, template = 코드 시드 양식(제미나이 없음). */
  contentMode: HubBoardContentMode;
  /** contentMode=template 일 때 레지스트리 양식 id. */
  templateId?: string;
  imagePool?: string[];
  imageFolderUrl?: string;
  /** 본문·대표 사진 랜덤 장수 하한 (1~7). */
  imageCountMin?: number;
  /** 본문·대표 사진 랜덤 장수 상한 (1~7). */
  imageCountMax?: number;
  extraPrompt?: string;
  dailyLimit: number;
  siteIds: string[];
  nextSiteIndex: number;
  keywords: HubBoardKeyword[];
  schedule: HubBoardSchedule;
  createdAt: string;
  updatedAt: string;
  excerpt?: string;
  bodyHtml?: string;
  coverImage?: string;
  status?: "scheduled" | "publishing" | "published" | "partial" | "failed";
  scheduledAt?: string | null;
  publishedAt?: string | null;
  results?: HubBoardResult[];
  vendorRecruitSlot?: boolean;
  youtubeUrl1?: string;
  youtubeUrl2?: string;
  topKeyword?: string;
  keywordCount?: number;
};

/** Dedicated hub cron / admin catch-up. Per campaign, not a shared pile. */
export const HUB_TICK_SOLO = 16;
/** Shared bulk cron still leaves room for bulk Gemini jobs. */
export const HUB_TICK_WITH_BULK = 6;

function masterSecret() {
  return process.env.MASTER_PASSWORD || "ybijour80";
}

function trimText(value: unknown) {
  return String(value ?? "").trim();
}

function clampHour(value: unknown, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(23, Math.max(0, Math.floor(num)));
}

function clampHubImageCount(value: unknown, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(7, Math.max(1, Math.floor(num)));
}

function normalizeKeyword(raw: unknown): HubBoardKeyword | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const keyword = trimText(row.keyword);
  if (!keyword) return null;
  const status = String(row.status || "queued");
  const youtube = parseYoutubeUrlPair(row);
  return {
    id: trimText(row.id) || uid(),
    keyword,
    status:
      status === "scheduled" || status === "processing" || status === "published" || status === "failed"
        ? status
        : "queued",
    siteId: trimText(row.siteId) || undefined,
    domain: trimText(row.domain) || undefined,
    postId: trimText(row.postId) || undefined,
    scheduledAt: trimText(row.scheduledAt) || undefined,
    publishedAt: trimText(row.publishedAt) || undefined,
    processingAt: trimText(row.processingAt) || undefined,
    processingClaim: trimText(row.processingClaim) || undefined,
    error: trimText(row.error) || undefined,
    title: trimText(row.title) || undefined,
    youtubeUrl1: youtube.youtubeUrl1,
    youtubeUrl2: youtube.youtubeUrl2,
  };
}

export function parseHubCampaign(raw: unknown, current?: HubBoardCampaign): HubBoardCampaign | null {
  if (!raw || typeof raw !== "object") return current || null;
  const row = raw as Record<string, unknown>;
  const vendor = parseVendorFields(row);
  const youtube = parseYoutubeUrlPair(row, current);
  const title = trimText(row.title ?? current?.title) || vendor.vendorName || "자유게시판 광고";
  const now = new Date().toISOString();
  const siteIds = Array.isArray(row.siteIds)
    ? [...new Set(row.siteIds.map((id) => String(id || "").trim()).filter(Boolean))]
    : current?.siteIds || [];
  const keywords = Array.isArray(row.keywords)
    ? row.keywords.map(normalizeKeyword).filter((item): item is HubBoardKeyword => Boolean(item))
    : current?.keywords || [];
  const scheduleRaw = (row.schedule && typeof row.schedule === "object" ? row.schedule : {}) as Record<string, unknown>;
  const prevSchedule = current?.schedule;
  const topKeyword =
    trimText(row.topKeyword) || current?.topKeyword || keywords[0]?.keyword || "";
  const keywordCount = Math.max(
    keywords.length,
    Math.floor(Number(row.keywordCount ?? current?.keywordCount) || 0)
  );
  const modeRaw = trimText(row.contentMode ?? current?.contentMode).toLowerCase();
  const contentMode: HubBoardContentMode = modeRaw === "template" ? "template" : "gemini";
  const templateId =
    contentMode === "template"
      ? trimText(row.templateId ?? current?.templateId) || "goldendoodle-adoption"
      : trimText(row.templateId ?? current?.templateId) || undefined;
  return {
    id: trimText(row.id ?? current?.id) || uid(),
    title,
    vendorName: "vendorName" in row ? vendor.vendorName : current?.vendorName,
    vendorPhone: "vendorPhone" in row ? vendor.vendorPhone : current?.vendorPhone,
    vendorWebsite: "vendorWebsite" in row ? vendor.vendorWebsite : current?.vendorWebsite,
    vendorKakao: "vendorKakao" in row ? vendor.vendorKakao : current?.vendorKakao,
    vendorId: "vendorId" in row ? vendor.vendorId : current?.vendorId,
    vendorIds: vendor.vendorIds?.length ? vendor.vendorIds : current?.vendorIds,
    imagePool: mergeImageUrls(
      [],
      Array.isArray(row.imagePool)
        ? row.imagePool.map((item) => String(item || ""))
        : current?.imagePool || (current?.coverImage ? [current.coverImage] : [])
    ),
    writingStyle: trimText(row.writingStyle ?? current?.writingStyle) || "random",
    contentMode,
    templateId,
    extraPrompt: trimText(row.extraPrompt ?? current?.extraPrompt) || undefined,
    imageFolderUrl: trimText(row.imageFolderUrl ?? current?.imageFolderUrl) || undefined,
    imageCountMin: clampHubImageCount(row.imageCountMin ?? current?.imageCountMin, 1),
    imageCountMax: Math.max(
      clampHubImageCount(row.imageCountMin ?? current?.imageCountMin, 1),
      clampHubImageCount(row.imageCountMax ?? current?.imageCountMax, 3)
    ),
    dailyLimit: Math.max(1, Math.min(9999, Math.floor(Number(row.dailyLimit ?? current?.dailyLimit) || 1))),
    siteIds,
    nextSiteIndex: Math.max(0, Math.floor(Number(row.nextSiteIndex ?? current?.nextSiteIndex) || 0)),
    keywords,
    schedule: {
      enabled:
        typeof scheduleRaw.enabled === "boolean"
          ? scheduleRaw.enabled
          : prevSchedule
            ? Boolean(prevSchedule.enabled)
            : true,
      startHour: clampHour(scheduleRaw.startHour ?? prevSchedule?.startHour, 1),
      endHour: 23,
      planDate: trimText(scheduleRaw.planDate ?? prevSchedule?.planDate),
    },
    createdAt: String(row.createdAt ?? current?.createdAt ?? now),
    updatedAt: String(row.updatedAt ?? now),
    excerpt: trimText(row.excerpt ?? current?.excerpt) || undefined,
    bodyHtml: current?.bodyHtml,
    coverImage: trimText(row.coverImage ?? current?.coverImage) || undefined,
    results: Array.isArray(row.results) ? (row.results as HubBoardResult[]) : current?.results || [],
    vendorRecruitSlot:
      typeof row.vendorRecruitSlot === "boolean" ? row.vendorRecruitSlot : Boolean(current?.vendorRecruitSlot),
    youtubeUrl1: youtube.youtubeUrl1,
    youtubeUrl2: youtube.youtubeUrl2,
    topKeyword,
    keywordCount,
  };
}

export function parseHubCampaigns(raw: unknown): HubBoardCampaign[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => parseHubCampaign(row))
    .filter((row): row is HubBoardCampaign => Boolean(row))
    .map((row) => pruneStalePublishedKeywords(row));
}

/** 발행 완료 후 하루가 지난 키워드는 목록에서 제거(저장 시에도 정리). */
export function pruneStalePublishedKeywords(campaign: HubBoardCampaign, now = new Date()): HubBoardCampaign {
  const today = seoulDateKey(now);
  if (!today) return campaign;
  const keywords = campaign.keywords.filter((item) => {
    if (item.status !== "published") return true;
    const day = seoulDateKey(item.publishedAt || item.scheduledAt || "");
    if (!day) return true;
    return day >= today;
  });
  if (keywords.length === campaign.keywords.length) return campaign;
  return { ...campaign, keywords, updatedAt: now.toISOString() };
}

export function consentedSites(sites: OpsSite[]) {
  return sites
    .filter((site) => site.boardAdsConsent && site.domain)
    .slice()
    .sort((a, b) => {
      const apex = String(a.apexDomain || "").localeCompare(String(b.apexDomain || ""), "ko");
      if (apex) return apex;
      return a.domain.localeCompare(b.domain, "ko");
    });
}

export function orderedCampaignSites(campaign: HubBoardCampaign, sites: OpsSite[]) {
  const selected = new Set(campaign.siteIds);
  return consentedSites(sites).filter((site) => selected.has(site.id));
}

/** Prefer consented ∩ selected, then selected by id, then all consented, then any domain. */
export function resolveCampaignTargets(campaign: HubBoardCampaign, sites: OpsSite[]) {
  const selected = orderedCampaignSites(campaign, sites);
  if (selected.length) return { targets: selected, campaign };
  const byId = sites.filter((site) => campaign.siteIds.includes(site.id) && site.domain);
  if (byId.length) return { targets: byId, campaign };
  const consented = consentedSites(sites);
  if (consented.length) {
    return {
      targets: consented,
      campaign: { ...campaign, siteIds: consented.map((site) => site.id) },
    };
  }
  const any = sites.filter((site) => Boolean(site.domain));
  if (any.length) {
    return {
      targets: any,
      campaign: { ...campaign, siteIds: any.map((site) => site.id) },
    };
  }
  return { targets: [] as OpsSite[], campaign };
}

export function appendCampaignKeywords(campaign: HubBoardCampaign, incoming: string[]) {
  const have = new Set(campaign.keywords.map((item) => item.keyword));
  const extra: HubBoardKeyword[] = [];
  for (const keyword of incoming) {
    if (have.has(keyword)) continue;
    have.add(keyword);
    extra.push({ id: uid(), keyword, status: "queued" });
  }
  const keywords = [...campaign.keywords, ...extra];
  return {
    campaign: {
      ...campaign,
      keywords,
      topKeyword: campaign.topKeyword || keywords[0]?.keyword || "",
      keywordCount: Math.max(campaign.keywordCount || 0, keywords.length),
    },
    added: extra.length,
  };
}

export function hubUsedTodayQuota(campaign: HubBoardCampaign, today: string) {
  return campaign.keywords.filter((item) => {
    if (item.status === "scheduled" || item.status === "processing") {
      return Boolean(item.scheduledAt && seoulDateKey(item.scheduledAt) === today);
    }
    if (item.status === "published") {
      return Boolean(item.publishedAt && seoulDateKey(item.publishedAt) === today);
    }
    return false;
  }).length;
}

function shuffleCopy<T>(items: T[]) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickRandomSite<T>(targets: T[]) {
  return targets[Math.floor(Math.random() * targets.length)];
}

/** Seoul day rolled over: unfinished yesterday slots no longer count toward today's quota,
 *  so planning would stack a full new day on top of the backlog. Put them back in queue. */
export function reclaimStaleHubKeywords(campaign: HubBoardCampaign, today: string, now = new Date()) {
  let changed = 0;
  const keywords = campaign.keywords.map((item) => {
    if (item.status !== "scheduled" && item.status !== "processing") return item;
    const day = item.scheduledAt ? seoulDateKey(item.scheduledAt) : "";
    if (day && day >= today) return item;
    // Stuck "processing" from a prior day (or missing scheduledAt) returns to the queue.
    if (item.status === "processing" && !day && item.processingAt) {
      const ageMs = now.getTime() - new Date(item.processingAt).getTime();
      if (Number.isFinite(ageMs) && ageMs < 30 * 60_000) return item;
    }
    changed += 1;
    return {
      ...item,
      status: "queued" as const,
      siteId: undefined,
      domain: undefined,
      scheduledAt: undefined,
      processingAt: undefined,
      processingClaim: undefined,
      error: undefined,
    };
  });
  if (!changed) return { campaign, reclaimed: 0 };
  return {
    reclaimed: changed,
    campaign: { ...campaign, keywords, updatedAt: now.toISOString() },
  };
}

/** Publish window from startHour through 23:59 KST (never land on next-day 00:00). */
function hubSeoulWindow(dateKey: string, startHour: number) {
  const start = new Date(`${dateKey}T${String(startHour).padStart(2, "0")}:00:00+09:00`);
  const end = new Date(`${dateKey}T23:59:00+09:00`);
  return { start, end };
}

function seoulHourMinute(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value || "0");
  return { hour, minute };
}

/** True when a scheduled time is stuck at/near Seoul midnight (legacy pile-up). */
function isMidnightStuck(iso?: string) {
  if (!iso) return true;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return true;
  const { hour, minute } = seoulHourMinute(iso);
  return hour === 0 && minute <= 5;
}

export function hubTodayProgress(campaign: HubBoardCampaign, now = new Date()) {
  const today = seoulDateKey(now);
  const publishedToday = campaign.keywords.filter(
    (item) => item.status === "published" && Boolean(item.publishedAt && seoulDateKey(item.publishedAt) === today)
  ).length;
  const scheduledToday = campaign.keywords.filter(
    (item) =>
      (item.status === "scheduled" || item.status === "processing") &&
      Boolean(item.scheduledAt && seoulDateKey(item.scheduledAt) === today)
  ).length;
  const waiting = campaign.keywords.filter((item) => item.status === "queued" || item.status === "failed").length;
  return {
    today,
    publishedToday,
    scheduledToday,
    waiting,
    dailyLimit: campaign.dailyLimit,
    remainingToday: Math.max(0, campaign.dailyLimit - publishedToday - scheduledToday),
    keywordCount: Math.max(campaign.keywordCount || 0, campaign.keywords.length),
    topKeyword: campaign.topKeyword || campaign.keywords[0]?.keyword || "",
    date: seoulDateKey(campaign.createdAt),
  };
}

export function hubBoardTodaySummary(campaigns: HubBoardCampaign[], now = new Date()) {
  const rows = campaigns.map((campaign) => hubTodayProgress(campaign, now));
  return {
    date: seoulDateKey(now),
    publishedToday: rows.reduce((sum, row) => sum + row.publishedToday, 0),
    scheduledToday: rows.reduce((sum, row) => sum + row.scheduledToday, 0),
    waiting: rows.reduce((sum, row) => sum + row.waiting, 0),
    dailyLimit: rows.reduce((sum, row) => sum + row.dailyLimit, 0),
    remainingToday: rows.reduce((sum, row) => sum + row.remainingToday, 0),
  };
}

export function planHubCampaign(
  campaign: HubBoardCampaign,
  sites: OpsSite[],
  now = new Date(),
  opts?: { force?: boolean }
) {
  const today = seoulDateKey(now);
  if (!today) return { planned: 0, campaign, reason: "no-date" as const };
  if (!campaign.schedule.enabled && !opts?.force) {
    return { planned: 0, campaign, reason: "schedule-off" as const };
  }
  const reclaimed = reclaimStaleHubKeywords(campaign, today, now);
  campaign = reclaimed.campaign;
  const resolved = resolveCampaignTargets(campaign, sites);
  const targets = resolved.targets;
  if (resolved.campaign.siteIds.join("\0") !== campaign.siteIds.join("\0")) {
    campaign = { ...resolved.campaign, updatedAt: now.toISOString() };
  } else {
    campaign = resolved.campaign;
  }
  if (!targets.length) return { planned: 0, campaign, reason: "no-sites" as const };
  const { start, end } = hubSeoulWindow(today, campaign.schedule.startHour);
  if (now >= end) {
    return {
      planned: 0,
      reason: "window-closed" as const,
      campaign: {
        ...campaign,
        schedule: { ...campaign.schedule, planDate: today },
        updatedAt: reclaimed.reclaimed ? now.toISOString() : campaign.updatedAt,
      },
    };
  }
  const keywords = campaign.keywords.map((item) => ({ ...item }));

  // Re-slot legacy midnight piles: today 00:00 (past or future) and next-day 00:00
  // from the old window end (dayStart + 24h). Those never re-planned when we only
  // looked at "today's future" slots.
  const rescheduleIds = new Set<string>();
  for (const item of keywords) {
    if (item.status !== "scheduled") continue;
    if (!item.scheduledAt || !isMidnightStuck(item.scheduledAt)) continue;
    const day = seoulDateKey(item.scheduledAt);
    // Yesterday+ is reclaimed above; keep releasing today/tomorrow midnight leftovers.
    if (!day || day < today) continue;
    item.status = "queued";
    item.scheduledAt = undefined;
    item.siteId = undefined;
    item.domain = undefined;
    item.error = undefined;
    rescheduleIds.add(item.id);
  }

  const remaining = Math.max(0, campaign.dailyLimit - hubUsedTodayQuota({ ...campaign, keywords }, today));
  const queued = shuffleCopy(keywords.filter((item) => item.status === "queued"));
  const take = Math.min(remaining, queued.length);
  if (!take) {
    return {
      planned: 0,
      reason: remaining <= 0 ? ("limit" as const) : ("empty" as const),
      campaign: {
        ...campaign,
        keywords,
        schedule: { ...campaign.schedule, planDate: today },
        updatedAt: reclaimed.reclaimed || rescheduleIds.size ? now.toISOString() : campaign.updatedAt,
      },
    };
  }
  const windowStart = now > start ? now : start;
  const slots = evenPublishSlots(take, windowStart, end);
  queued.slice(0, take).forEach((item, i) => {
    const found = keywords.find((row) => row.id === item.id);
    if (!found) return;
    const site = pickRandomSite(targets);
    found.status = "scheduled";
    found.siteId = site.id;
    found.domain = site.domain;
    found.scheduledAt = slots[i].toISOString();
    found.error = undefined;
  });
  return {
    planned: take,
    reason: "ok" as const,
    campaign: {
      ...campaign,
      keywords,
      schedule: {
        ...campaign.schedule,
        enabled: true,
        planDate: today,
      },
      updatedAt: now.toISOString(),
    },
  };
}

export function removeCampaignKeyword(campaign: HubBoardCampaign, keywordId: string) {
  const keywords = campaign.keywords.filter((row) => row.id !== keywordId);
  if (keywords.length === campaign.keywords.length) return null;
  return {
    ...campaign,
    keywords,
    topKeyword: campaign.topKeyword && keywords.some((row) => row.keyword === campaign.topKeyword)
      ? campaign.topKeyword
      : keywords[0]?.keyword || "",
    keywordCount: Math.max(keywords.length, Math.max(0, (campaign.keywordCount || 0) - 1)),
    updatedAt: new Date().toISOString(),
  };
}

export function dueHubKeywords(campaigns: HubBoardCampaign[], now = new Date()) {
  const due: { campaign: HubBoardCampaign; keyword: HubBoardKeyword }[] = [];
  for (const campaign of campaigns) {
    for (const keyword of campaign.keywords) {
      if (!canClaimDueKeyword(keyword.status, keyword.processingAt, now)) continue;
      if (!keyword.scheduledAt || new Date(keyword.scheduledAt).getTime() > now.getTime()) continue;
      due.push({ campaign, keyword });
    }
  }
  due.sort((a, b) => String(a.keyword.scheduledAt).localeCompare(String(b.keyword.scheduledAt)));
  return due;
}

/** Due first, then today's remaining scheduled ads so a tick is not stuck at 4 while the rest wait until night.
 *  `limit` is per campaign. Extra ads registered with another vendor do not share one pile. */
export function pickHubTickKeywords(
  campaigns: HubBoardCampaign[],
  limit: number,
  now = new Date(),
  totalCap?: number
) {
  const cap = Math.max(1, Math.floor(limit) || 1);
  const queues = campaigns.map((campaign) => pickCampaignTickKeywords(campaign, cap, now));
  const picked: { campaign: HubBoardCampaign; keyword: HubBoardKeyword }[] = [];
  let index = 0;
  let added = true;
  while (added) {
    added = false;
    for (const queue of queues) {
      const row = queue[index];
      if (!row) continue;
      picked.push(row);
      added = true;
    }
    index += 1;
  }
  if (typeof totalCap === "number" && Number.isFinite(totalCap)) {
    return picked.slice(0, Math.max(1, Math.floor(totalCap)));
  }
  return picked;
}

function pickCampaignTickKeywords(campaign: HubBoardCampaign, cap: number, now: Date) {
  const due = dueHubKeywords([campaign], now);
  if (due.length >= cap) return due.slice(0, cap);
  const taken = new Set(due.map((row) => row.keyword.id));
  const extra: { campaign: HubBoardCampaign; keyword: HubBoardKeyword }[] = [];
  if (!campaign.schedule.enabled) return due;
  const today = seoulDateKey(now);
  for (const keyword of campaign.keywords) {
    if (taken.has(keyword.id)) continue;
    if (keyword.status !== "scheduled") continue;
    if (!keyword.scheduledAt || seoulDateKey(keyword.scheduledAt) !== today) continue;
    extra.push({ campaign, keyword });
  }
  extra.sort((a, b) => String(a.keyword.scheduledAt).localeCompare(String(b.keyword.scheduledAt)));
  return [...due, ...extra].slice(0, cap);
}

export function findHubKeyword(campaigns: HubBoardCampaign[], campaignId: string, keywordId: string) {
  const campaign = campaigns.find((row) => row.id === campaignId);
  const keyword = campaign?.keywords.find((row) => row.id === keywordId);
  if (!campaign || !keyword) return null;
  return { campaign, keyword };
}

export function assignNextSite(campaign: HubBoardCampaign, keyword: HubBoardKeyword, sites: OpsSite[]) {
  // Same target resolution as planning — consent-preferred, then selected siteIds, then any domain.
  const { targets, campaign: nextCampaign } = resolveCampaignTargets(campaign, sites);
  if (!targets.length) throw new Error("동의한 발행 사이트가 없습니다.");
  const existing = keyword.siteId ? targets.find((site) => site.id === keyword.siteId) : undefined;
  if (existing) return { campaign: nextCampaign, keyword, site: existing };
  const site = pickRandomSite(targets);
  const nextKeyword = { ...keyword, siteId: site.id, domain: site.domain };
  return {
    campaign: {
      ...nextCampaign,
      keywords: nextCampaign.keywords.map((row) => (row.id === keyword.id ? nextKeyword : row)),
      updatedAt: new Date().toISOString(),
    },
    keyword: nextKeyword,
    site,
  };
}

export function hubCampaignStats(campaign: HubBoardCampaign) {
  const published = campaign.keywords.filter((item) => item.status === "published").length;
  const failed = campaign.keywords.filter((item) => item.status === "failed").length;
  const queued = campaign.keywords.filter((item) => item.status === "queued").length;
  const scheduled = campaign.keywords.filter((item) => item.status === "scheduled" || item.status === "processing").length;
  const total = campaign.keywords.length;
  const remaining = queued + scheduled;
  const daysLeft = campaign.dailyLimit > 0 ? Math.ceil(remaining / campaign.dailyLimit) : remaining;
  return {
    total,
    published,
    failed,
    queued,
    scheduled,
    remaining,
    percent: total ? Math.round((published / total) * 100) : 0,
    daysLeft,
    dailyLimit: campaign.dailyLimit,
  };
}

export async function fetchSiteVoice(site: OpsSite) {
  try {
    const origin = siteRequestOrigin(site);
    if (!origin) return {};
    const res = await fetch(`${origin}/api/ops/board`, {
      headers: { "x-infocs-master": masterSecret() },
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      writingTone?: string;
      writingPersona?: string;
      siteName?: string;
      siteTagline?: string;
    };
    if (!res.ok) return {};
    return {
      writingTone: String(data.writingTone || "").trim(),
      writingPersona: String(data.writingPersona || "").trim(),
      siteName: String(data.siteName || "").trim(),
      siteTagline: String(data.siteTagline || "").trim(),
    };
  } catch {
    return {};
  }
}

export function collectHubAvoidTitles(
  campaigns: HubBoardCampaign[],
  extra: Array<string | undefined | null> = []
) {
  return uniqueTextList([
    ...campaigns.flatMap((row) => row.keywords.map((item) => item.title)),
    ...extra,
  ]);
}

export function collectHubTodayKeywords(campaigns: HubBoardCampaign[], now = new Date()) {
  return collectTodayKeywords(
    campaigns.flatMap((row) => row.keywords),
    now
  );
}

export async function fetchSiteRecentPosts(site: OpsSite): Promise<{ titles: string[]; bodies: string[] }> {
  try {
    const origin = siteRequestOrigin(site);
    if (!origin) return { titles: [], bodies: [] };
    const res = await fetch(`${origin}/feed/posts.json`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      posts?: Array<{ title?: string; bodyPreview?: string; description?: string }>;
    };
    if (!res.ok || !Array.isArray(data.posts)) return { titles: [], bodies: [] };
    const rows = data.posts.slice(0, 40);
    return {
      titles: uniqueTextList(rows.map((post) => post.title)),
      bodies: rows.map((post) => String(post.bodyPreview || post.description || "").trim()).filter(Boolean),
    };
  } catch {
    return { titles: [], bodies: [] };
  }
}

export async function fetchSiteRecentTitles(site: OpsSite): Promise<string[]> {
  return (await fetchSiteRecentPosts(site)).titles;
}

export async function generateHubBoardArticle(
  campaign: HubBoardCampaign,
  keyword: HubBoardKeyword,
  site: OpsSite,
  settings: Settings,
  avoid?: { titles?: string[]; keywords?: string[]; bodies?: string[] }
) {
  if (campaign.contentMode === "template") {
    return renderHubBoardTemplateArticle(campaign, keyword, site, settings, avoid);
  }
  const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) throw new Error("허브 마스터설정에 제미나이 API 키가 없습니다.");
  const extraPrompt = trimText(campaign.extraPrompt);
  const keywordBan = bannedContentError(
    settings.publishBannedKeywords,
    keyword.keyword,
    campaign.vendorName,
    extraPrompt
  );
  if (keywordBan) throw new Error(keywordBan);
  const voice = await fetchSiteVoice(site);
  const writingStyle = resolveArticleStyle(campaign.writingStyle || "random", keyword.keyword);
  const siteName = voice.siteName || site.siteName || site.domain;
  const avoidTitles = uniqueTextList(avoid?.titles || []);
  const avoidKeywords = uniqueTextList(avoid?.keywords || []);
  const avoidBodies = (avoid?.bodies || []).map((item) => String(item || "").trim()).filter(Boolean);
  const place = extractPlaceName(keyword.keyword, site.concept, siteName) || "";
  const article = await withUniqueArticle(
    (nextAvoid) =>
      generateArticle({
        topic: keyword.keyword,
        writingStyle,
        category: FREE_BOARD_SLUG,
        categoryName: "자유게시판",
        notes: resolveGeminiNotes(
          [
            `이 글은 ${siteName} (${site.domain}) 자유게시판 광고 글이다. 사이트 컨셉: ${site.concept || "생활 정보 매거진"}${voice.siteTagline ? `. 소개: ${voice.siteTagline}` : ""}. 업체 ${campaign.vendorName || ""}를 자연스럽게 소개하되 과장 광고 문장은 피한다. 말투는 이 사이트 설정(합니다체/했어요체 등)을 그대로 따른다.`,
            extraPrompt ? `추가 프롬프트:\n${extraPrompt}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
          ""
        ),
        focusKeyword: keyword.keyword,
        region: place,
        vendorName: campaign.vendorName,
        writingTone: voice.writingTone || settings.writingTone,
        writingPersona: voice.writingPersona || settings.writingPersona,
        experienceNotes: extraPrompt,
        avoidTitles: nextAvoid,
        avoidKeywords,
        apiKey,
        model: settings.geminiModel || DEFAULT_GEMINI_MODEL,
      }),
    avoidTitles,
    avoidBodies,
    keyword.keyword
  );
  const generatedBan = bannedContentError(
    settings.publishBannedKeywords,
    collectPublishText({
      title: article.title,
      excerpt: article.excerpt,
      bodyHtml: article.bodyHtml,
      focusKeyword: keyword.keyword,
      tags: article.tags,
    })
  );
  if (generatedBan) throw new Error(generatedBan);
  let imagePool = campaign.imagePool || (campaign.coverImage ? [campaign.coverImage] : []);
  if (!imagePool.length && campaign.imageFolderUrl) {
    try {
      const found = await discoverWebFolderImages(campaign.imageFolderUrl);
      imagePool = found.urls;
    } catch {
      imagePool = [];
    }
  }
  const photos = pickRandomPostImages(
    imagePool,
    campaign.imageCountMin || 1,
    campaign.imageCountMax || 3
  );
  const youtube = preferYoutubePair(keyword, campaign);
  return {
    hubCampaignId: `${campaign.id}:${keyword.id}`,
    title: article.title,
    excerpt: article.excerpt || keyword.keyword,
    // 지역·공공 팩트는 본문에 심지 않고 글 페이지 하단 접기에서만 노출
    bodyHtml: cleanHtml(ensureVendorSlots(article.bodyHtml || "")),
    coverImage: photos.cover || "",
    extraImages: photos.extras,
    focusKeyword: keyword.keyword,
    faqItems: article.faqItems,
    regionInfo: article.regionInfo,
    nearbyAreas: parseNameList(article.nearbyAreas),
    nearbyStations: parseNameList(article.nearbyStations),
    slug: articleSlug(article.slugHint, keyword.keyword),
    vendorName: campaign.vendorName || "",
    vendorPhone: campaign.vendorPhone || "",
    vendorWebsite: campaign.vendorWebsite || "",
    vendorKakao: campaign.vendorKakao || "",
    vendorId: campaign.vendorId || "",
    vendorIds: campaign.vendorIds || (campaign.vendorId ? [campaign.vendorId] : []),
    region: extractPlaceName(article.title, keyword.keyword) || "",
    vendorRecruitSlot: Boolean(campaign.vendorRecruitSlot),
    hubVendorRegisterUrl: normalizeHttpUrl(settings.vendorRegisterUrl) || "",
    youtubeUrl1: youtube.youtubeUrl1 || "",
    youtubeUrl2: youtube.youtubeUrl2 || "",
  };
}

export async function pushBoardPost(site: OpsSite, payload: Record<string, unknown>) {
  const origin = siteRequestOrigin(site);
  if (!origin) throw new Error("사이트 origin이 없습니다.");
  const url = `${origin}/api/ops/board`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-infocs-master": masterSecret(),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25000),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; post?: { id?: string }; duplicate?: boolean };
  if (!res.ok) throw new Error(data.error || `실패 (${res.status})`);
  return data;
}

export function makeBoardPost(body: Record<string, unknown>, existing: Post[]): Post {
  const title = trimText(body.title);
  let slug = slugify(String(body.slug || title));
  if (existing.some((post) => post.slug === slug)) slug = `${slug}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const vendor = parseVendorFields(body);
  const hubCampaignId = trimText(body.hubCampaignId) || undefined;
  return {
    id: uid(),
    slug,
    title,
    excerpt: trimText(body.excerpt) || title,
    bodyHtml: cleanHtml(ensureVendorSlots(String(body.bodyHtml || ""))),
    category: FREE_BOARD_SLUG,
    tags: Array.isArray(body.tags) ? body.tags.map((item) => String(item)).filter(Boolean) : ["자유게시판"],
    coverImage: trimText(body.coverImage) || undefined,
    extraImages: Array.isArray(body.extraImages)
      ? body.extraImages
          .map((item) => {
            if (typeof item === "string") return { url: item };
            if (item && typeof item === "object" && "url" in item) return { url: String((item as { url?: string }).url || "") };
            return null;
          })
          .filter((item): item is { url: string } => Boolean(item?.url))
      : undefined,
    focusKeyword: trimText(body.focusKeyword) || undefined,
    faqItems: parseFaqItems(body.faqItems),
    regionInfo: trimText(body.regionInfo) || undefined,
    nearbyAreas: parseNameList(body.nearbyAreas),
    nearbyStations: parseNameList(body.nearbyStations),
    status: "published",
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
    theme: "art-blog",
    hubCampaignId,
    region: trimText(body.region) || undefined,
    ...vendor,
    vendorRecruitSlot: Boolean(body.vendorRecruitSlot) || undefined,
    hubVendorRegisterUrl: normalizeHttpUrl(body.hubVendorRegisterUrl),
  };
}

export function alreadyHasCampaign(posts: Post[], hubCampaignId: string) {
  return posts.some((post) => post.hubCampaignId === hubCampaignId);
}

export { parseKeywordList };
