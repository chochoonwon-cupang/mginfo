import { parseKeywordList } from "./bulk-keywords";
import { ensureCategorySlug, getCategory } from "./categories";
import { applyGenerationMeta, generateBulkArticle } from "./content-pipeline";
import { notifyPostIndexed } from "./indexnow";
import { canClaimDueKeyword, canClaimManualKeyword } from "./publish-claim";
import { checkCanCreatePost, checkCanPublish, countPostsCreatedToday, seoulDateKey } from "./publish-limits";
import { bannedContentError, collectPublishText } from "./banned-keywords";
import { extractPlaceName, parseNameList } from "./region-geo";
import { cleanHtml } from "./sanitize";
import { articleSlug, uid } from "./slug";
import { attachLocalFactBlocks } from "./article-blocks";
import { mergeImageUrls, pickRandomPostImages } from "./image-pool";
import { parseVendorFields } from "./vendor";
import { parseYoutubeUrlPair, preferYoutubePair } from "./youtube";
import { ensureVendorSlots } from "./vendor-slots";
import { defaultPilotConfig, normalizePilotConfig, type BulkPilotConfig } from "./pilot-config";
import { appendPilotEvent, countPilotPublishedToday } from "./pilot-store";
import { samplePublicPilotPage } from "./pilot-sample";
import { revalidatePublicSite } from "./public-cache";
import type {
  BulkGroup,
  BulkKeyword,
  BulkPublishState,
  BulkSchedule,
  Category,
  Post,
  Store,
} from "./types";

export { parseKeywordList } from "./bulk-keywords";

export const DEFAULT_BULK_SCHEDULE: BulkSchedule = {
  enabled: false,
  startHour: 1,
  endHour: 23,
  planDate: "",
};

export function defaultBulkPublish(): BulkPublishState {
  return { schedule: { ...DEFAULT_BULK_SCHEDULE }, groups: [], pilot: defaultPilotConfig() };
}

export function normalizeBulkPublish(value?: Partial<BulkPublishState> | null): BulkPublishState {
  const schedule = { ...DEFAULT_BULK_SCHEDULE, ...(value?.schedule || {}) };
  schedule.startHour = clampHour(schedule.startHour, 1);
  schedule.endHour = clampHour(schedule.endHour, 23);
  if (schedule.endHour <= schedule.startHour) schedule.endHour = 23;
  schedule.planDate = String(schedule.planDate || "");
  const groups = Array.isArray(value?.groups) ? value.groups.map(normalizeGroup).filter(Boolean) as BulkGroup[] : [];
  return { schedule, groups, pilot: normalizePilotConfig(value?.pilot) };
}

function clampHour(value: unknown, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(23, Math.max(0, Math.floor(num)));
}

function normalizeGroup(raw: Partial<BulkGroup>): BulkGroup | null {
  if (!raw || typeof raw !== "object") return null;
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords
        .map((item) => {
          const keyword = String(item?.keyword || "").trim();
          if (!keyword) return null;
          const youtube = parseYoutubeUrlPair((item || {}) as Record<string, unknown>);
          return {
            id: String(item.id || uid()),
            keyword,
            status: item.status || "queued",
            postId: item.postId,
            scheduledAt: item.scheduledAt,
            publishedAt: item.publishedAt,
            processingAt: item.processingAt,
            processingClaim: item.processingClaim,
            error: item.error,
            youtubeUrl1: youtube.youtubeUrl1,
            youtubeUrl2: youtube.youtubeUrl2,
          } as BulkKeyword;
        })
        .filter((item): item is BulkKeyword => Boolean(item))
    : [];
  const vendor = parseVendorFields(raw as Record<string, unknown>);
  const max = Math.max(1, Math.min(7, Math.floor(Number(raw.imageCountMax ?? raw.imageCount) || 3)));
  const min = Math.max(1, Math.min(max, Math.floor(Number(raw.imageCountMin) || 1)));
  return {
    id: String(raw.id || uid()),
    category: String(raw.category || "life"),
    dailyLimit: Math.max(1, Math.min(80, Math.floor(Number(raw.dailyLimit) || 1))),
    vendorName: vendor.vendorName,
    vendorPhone: vendor.vendorPhone,
    vendorWebsite: vendor.vendorWebsite,
    vendorKakao: vendor.vendorKakao,
    vendorPlaceUrl: vendor.vendorPlaceUrl,
    vendorId: vendor.vendorId,
    vendorIds: vendor.vendorIds,
    youtubeUrl1: vendor.youtubeUrl1,
    youtubeUrl2: vendor.youtubeUrl2,
    writingStyle: String(raw.writingStyle || "random").trim() || "random",
    extraPrompt: String(raw.extraPrompt || "").trim() || undefined,
    imagePool: mergeImageUrls([], Array.isArray(raw.imagePool) ? raw.imagePool.map((item) => String(item || "")) : []),
    imageCountMin: min,
    imageCountMax: max,
    industryId: String(raw.industryId || "").trim() || undefined,
    blueprintId: String(raw.blueprintId || "").trim() || undefined,
    keywords,
  };
}

export function appendKeywords(group: BulkGroup, incoming: string[]): { group: BulkGroup; added: number } {
  const have = new Set(group.keywords.map((item) => item.keyword));
  const extra: BulkKeyword[] = [];
  for (const keyword of incoming) {
    if (have.has(keyword)) continue;
    have.add(keyword);
    extra.push({ id: uid(), keyword, status: "queued" });
  }
  return { group: { ...group, keywords: [...group.keywords, ...extra] }, added: extra.length };
}

function padHour(hour: number) {
  return String(hour).padStart(2, "0");
}

export function seoulWindow(dateKey: string, startHour: number, endHour: number) {
  return {
    start: new Date(`${dateKey}T${padHour(startHour)}:00:00+09:00`),
    end: new Date(`${dateKey}T${padHour(endHour)}:00:00+09:00`),
  };
}

export function randomPublishSlots(count: number, start: Date, end: Date): Date[] {
  if (count <= 0) return [];
  const startMs = start.getTime();
  const endMs = Math.max(startMs + 60_000, end.getTime());
  const span = endMs - startMs;
  const minGap = Math.min(18 * 60_000, Math.max(6 * 60_000, Math.floor(span / (count + 2))));
  const slots: Date[] = [];
  for (let i = 0; i < count; i += 1) {
    const raw = new Date(startMs + Math.floor(Math.random() * span));
    slots.push(raw);
  }
  slots.sort((a, b) => a.getTime() - b.getTime());
  for (let i = 1; i < slots.length; i += 1) {
    const minTime = slots[i - 1].getTime() + minGap + Math.floor(Math.random() * 7 * 60_000);
    if (slots[i].getTime() < minTime) {
      slots[i] = new Date(Math.min(endMs, minTime));
    }
  }
  return slots;
}

/** Spread `count` publish times evenly across [start, end). No midnight pile-up. */
export function evenPublishSlots(count: number, start: Date, end: Date): Date[] {
  if (count <= 0) return [];
  const startMs = start.getTime();
  const endMs = Math.max(startMs + 60_000, end.getTime());
  const span = endMs - startMs;
  if (count === 1) {
    return [new Date(startMs + Math.floor(span / 2))];
  }
  const slots: Date[] = [];
  for (let i = 0; i < count; i += 1) {
    // (i+0.5)/count keeps first/last away from exact edges and spaces evenly.
    const t = startMs + Math.floor(((i + 0.5) / count) * span);
    slots.push(new Date(Math.min(endMs - 1_000, Math.max(startMs, t))));
  }
  return slots;
}

function openKeywords(group: BulkGroup) {
  return group.keywords.filter((item) => item.status === "queued" || item.status === "scheduled");
}

function usedTodayQuota(group: BulkGroup, today: string) {
  return group.keywords.filter((item) => {
    if (item.status === "scheduled" || item.status === "processing") {
      return Boolean(item.scheduledAt && seoulDateKey(item.scheduledAt) === today);
    }
    if (item.status === "published") {
      return Boolean(item.publishedAt && seoulDateKey(item.publishedAt) === today);
    }
    return false;
  }).length;
}

export function planToday(
  store: Store,
  now = new Date(),
  opts?: { pilotRemaining?: number }
) {
  const state = store.bulkPublish;
  const today = seoulDateKey(now);
  if (!today || !state.schedule.enabled) return { planned: 0, reason: "off" as const };

  const { start, end } = seoulWindow(today, state.schedule.startHour, state.schedule.endHour);
  if (now >= end) {
    state.schedule.planDate = today;
    return { planned: 0, reason: "closed" as const };
  }
  const windowStart = now > start ? now : start;
  const masterLimit = Number(store.settings.dailyPostLimit) || 0;
  const used = countPostsCreatedToday(store.posts);
  let remaining = masterLimit > 0 ? Math.max(0, masterLimit - used) : 999;
  if (typeof opts?.pilotRemaining === "number") {
    remaining = Math.min(remaining, Math.max(0, opts.pilotRemaining));
  }

  const picks: BulkKeyword[] = [];
  for (const group of state.groups) {
    if (remaining <= 0) break;
    const quota = Math.max(0, group.dailyLimit - usedTodayQuota(group, today));
    const queued = group.keywords.filter((item) => item.status === "queued");
    const take = Math.min(quota, remaining, queued.length);
    picks.push(...queued.slice(0, take));
    remaining -= take;
  }

  if (!picks.length) {
    state.schedule.planDate = today;
    return { planned: 0, reason: remaining <= 0 ? "limit" : "empty" as const };
  }

  const slots = randomPublishSlots(picks.length, windowStart, end);
  picks.forEach((item, index) => {
    item.status = "scheduled";
    item.scheduledAt = slots[index].toISOString();
    item.error = undefined;
  });
  state.schedule.planDate = today;
  return { planned: picks.length, reason: "ok" as const };
}

export function dueKeywords(store: Store, now = new Date()) {
  const due: { group: BulkGroup; keyword: BulkKeyword }[] = [];
  for (const group of store.bulkPublish.groups) {
    for (const keyword of group.keywords) {
      if (!canClaimDueKeyword(keyword.status, keyword.processingAt, now)) continue;
      if (keyword.status === "scheduled" || keyword.status === "processing") {
        if (!keyword.scheduledAt || new Date(keyword.scheduledAt).getTime() > now.getTime()) continue;
      }
      due.push({ group, keyword });
    }
  }
  due.sort((a, b) => String(a.keyword.scheduledAt).localeCompare(String(b.keyword.scheduledAt)));
  return due;
}

export function bulkStats(state: BulkPublishState, categories: Category[] = []) {
  const all = state.groups.flatMap((group) => group.keywords);
  const published = all.filter((item) => item.status === "published").length;
  const failed = all.filter((item) => item.status === "failed").length;
  const queued = all.filter((item) => item.status === "queued").length;
  const scheduled = all.filter((item) => item.status === "scheduled" || item.status === "processing").length;
  const total = all.length;
  const remaining = queued + scheduled;
  const today = seoulDateKey();
  const todayScheduled = all.filter((item) => item.scheduledAt && seoulDateKey(item.scheduledAt) === today).length;
  const todayPublished = all.filter((item) => item.publishedAt && seoulDateKey(item.publishedAt) === today).length;
  const dailyCapacity = state.groups.reduce((sum, group) => {
    const left = openKeywords(group).length;
    return sum + Math.min(group.dailyLimit, left);
  }, 0);
  let daysLeft = 0;
  const leftPerGroup = state.groups.map((group) => openKeywords(group).length);
  while (leftPerGroup.some((n) => n > 0) && daysLeft < 4000) {
    daysLeft += 1;
    for (let i = 0; i < leftPerGroup.length; i += 1) {
      leftPerGroup[i] = Math.max(0, leftPerGroup[i] - state.groups[i].dailyLimit);
    }
  }
  const groups = state.groups.map((group) => {
    const cat = getCategory(group.category, categories);
    const done = group.keywords.filter((item) => item.status === "published").length;
    const left = openKeywords(group).length;
    return {
      id: group.id,
      category: group.category,
      name: cat?.name || group.category,
      vendorName: group.vendorName || "",
      dailyLimit: group.dailyLimit,
      total: group.keywords.length,
      done,
      failed: group.keywords.filter((item) => item.status === "failed").length,
      remaining: left,
      percent: group.keywords.length ? Math.round((done / group.keywords.length) * 100) : 0,
    };
  });
  return {
    total,
    published,
    failed,
    queued,
    scheduled,
    remaining,
    percent: total ? Math.round((published / total) * 100) : 0,
    daysLeft,
    dailyCapacity,
    todayScheduled,
    todayPublished,
    enabled: state.schedule.enabled,
    startHour: state.schedule.startHour,
    endHour: state.schedule.endHour,
    planDate: state.schedule.planDate,
    groups,
  };
}

const MAX_PER_TICK = 6;
/** Stop starting new Gemini jobs before Vercel `maxDuration` (300s) hard-timeout. */
const TICK_BUDGET_MS = 240_000;

export type BulkPublishTickResult = {
  processed: number;
  results: Array<{
    keyword: string;
    ok: boolean;
    skipped?: boolean;
    held?: boolean;
    error?: string;
    slug?: string;
    url?: string;
    outcome?: string;
  }>;
  error?: string;
  pilotPublishedToday?: number;
};

export async function publishDueBulk(
  store: Store,
  opts: { mutator: typeof import("./db").updateStore; siteOrigin?: string }
): Promise<BulkPublishTickResult> {
  const createBlock = checkCanCreatePost(store.settings, store.posts);
  if (createBlock) return { processed: 0, results: [], error: createBlock };
  const publishBlock = checkCanPublish(store.settings);
  if (publishBlock) return { processed: 0, results: [], error: publishBlock };

  const pilot = normalizePilotConfig(store.bulkPublish.pilot);
  let pilotPublishedToday = 0;
  if (pilot.enabled) {
    pilotPublishedToday = await countPilotPublishedToday();
    if (pilotPublishedToday >= pilot.dailySuccessLimit) {
      return {
        processed: 0,
        results: [],
        error: `Pilot 일일 성공 한도(${pilot.dailySuccessLimit}) 도달`,
        pilotPublishedToday,
      };
    }
  }

  const due = dueKeywords(store).slice(0, MAX_PER_TICK);
  const results: BulkPublishTickResult["results"] = [];
  const tickStarted = Date.now();
  const origin = (opts.siteOrigin || process.env.NEXT_PUBLIC_SITE_URL || "https://magazine.infocs.co.kr").replace(
    /\/$/,
    ""
  );

  for (const item of due) {
    if (Date.now() - tickStarted >= TICK_BUDGET_MS) break;
    if (pilot.enabled) {
      pilotPublishedToday = await countPilotPublishedToday();
      if (pilotPublishedToday >= pilot.dailySuccessLimit) {
        results.push({
          keyword: item.keyword.keyword,
          ok: false,
          skipped: true,
          error: `Pilot 일일 성공 한도(${pilot.dailySuccessLimit})`,
          outcome: "pilot_limit",
        });
        break;
      }
    }

    const claimed = await claimBulkKeyword(opts.mutator, item.keyword.id, "due");
    if (!claimed) continue;
    const limitBlock = checkCanCreatePost(claimed.store.settings, claimed.store.posts);
    if (limitBlock) {
      await releaseBulkClaim(opts.mutator, item.keyword.id, claimed.claim, "scheduled");
      results.push({ keyword: item.keyword.keyword, ok: false, error: limitBlock });
      break;
    }
    try {
      const post = await generateAndSave(claimed.store, claimed.group, claimed.keyword, {
        pilotMode: pilot.enabled,
        pilot,
      });
      const accepted = await finishBulkPublish(opts.mutator, item.keyword.id, claimed.claim, post);
      if (!accepted) continue;

      let indexOk = true;
      try {
        await notifyPostIndexed(post.slug);
      } catch {
        indexOk = false;
      }
      try {
        revalidatePublicSite();
      } catch {
        /* ignore */
      }

      const warn =
        post.generationLog?.publishDecision === "WARN_PUBLISH" ||
        (post.generationLog?.qualityChecks || []).some((c) => c.severity === "WARN");
      const isLegacy =
        post.generationMode === "legacy" || post.generationMode === "legacy_fallback";
      const outcome = isLegacy ? "legacy_fallback" : warn ? "published_warn" : "published_pass";
      const geminiCalls =
        (post.generationLog?.plannerCalls || 0) + (post.generationLog?.writerCalls || 0);
      const warningCodes = (post.generationLog?.qualityChecks || [])
        .filter((c) => c.severity === "WARN")
        .map((c) => c.code);

      const event =
        pilot.enabled
          ? await appendPilotEvent({
              keyword: item.keyword.keyword,
              industryId: post.industryId || post.generationLog?.industryId,
              slug: post.slug,
              url: `${origin}/posts/${post.slug}`,
              outcome,
              publishDecision: post.generationLog?.publishDecision,
              failureCategory: post.generationLog?.failureCategory,
              generationMode: post.generationMode,
              warningCodes,
              plannerCalls: post.generationLog?.plannerCalls,
              writerCalls: post.generationLog?.writerCalls,
              plannerRetries: post.generationLog?.plannerRetries,
              writerRetries: post.generationLog?.writerRetries,
              geminiCalls,
              inputTokens: sumTokens(
                post.generationLog?.plannerTokens?.inputTokens,
                post.generationLog?.writerTokens?.inputTokens
              ),
              outputTokens: sumTokens(
                post.generationLog?.plannerTokens?.outputTokens,
                post.generationLog?.writerTokens?.outputTokens
              ),
              totalTokens: sumTokens(
                post.generationLog?.plannerTokens?.totalTokens,
                post.generationLog?.writerTokens?.totalTokens
              ),
              legacyFallback: isLegacy,
              message: indexOk ? undefined : "IndexNow 실패(Post 유지)",
            }).catch(() => null)
          : null;

      if (event) {
        samplePublicPilotPage(event.id, post.slug, origin).catch(() => undefined);
      }

      results.push({
        keyword: item.keyword.keyword,
        ok: true,
        slug: post.slug,
        url: `${origin}/posts/${post.slug}`,
        outcome,
      });
      if (pilot.enabled) pilotPublishedToday += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "발행 실패";
      const handled = await handlePilotPublishError({
        mutator: opts.mutator,
        keywordId: item.keyword.id,
        claim: claimed.claim,
        keyword: item.keyword.keyword,
        message,
        pilotEnabled: pilot.enabled,
      });
      results.push(handled.result);
    }
  }
  return {
    processed: results.length,
    results,
    pilotPublishedToday: pilot.enabled ? await countPilotPublishedToday() : undefined,
  };
}

function sumTokens(a?: number | null, b?: number | null): number | null {
  if (a == null && b == null) return null;
  return (a || 0) + (b || 0);
}

async function handlePilotPublishError(input: {
  mutator: typeof import("./db").updateStore;
  keywordId: string;
  claim: string;
  keyword: string;
  message: string;
  pilotEnabled: boolean;
}): Promise<{ result: BulkPublishTickResult["results"][number] }> {
  const msg = input.message;
  const isDup = /SLUG_EXISTS|KEYWORD_EXISTS/.test(msg);
  const isUnresolved = /INDUSTRY_UNRESOLVED|industry unresolved|업종 미해결/i.test(msg);
  const isIndustrySkip = /INDUSTRY_NOT_ALLOWED|Pilot 허용 업종/i.test(msg);
  const isHold = /발행 HOLD/.test(msg);
  const isVerified = /VERIFIED_DATA_FAILURE/.test(msg);
  const isQuality = /QUALITY_FAILURE/.test(msg);
  const isTechnical = /TECHNICAL_FAILURE/.test(msg);

  // Skip paths: leave keyword queued (do not burn as failed).
  if (isDup || isUnresolved || isIndustrySkip) {
    await releaseBulkClaim(input.mutator, input.keywordId, input.claim, "queued");
    const outcome = isDup
      ? "skipped_duplicate"
      : isUnresolved
        ? "skipped_unresolved"
        : "skipped_industry";
    if (input.pilotEnabled) {
      await appendPilotEvent({
        keyword: input.keyword,
        outcome,
        message: msg,
      }).catch(() => undefined);
    }
    return {
      result: {
        keyword: input.keyword,
        ok: false,
        skipped: true,
        error: msg,
        outcome,
      },
    };
  }

  await failBulkClaim(input.mutator, input.keywordId, input.claim, msg);

  let outcome: string = "error";
  let failureCategory: string | undefined;
  if (isHold) {
    outcome = "held";
    failureCategory = isVerified
      ? "VERIFIED_DATA_FAILURE"
      : isTechnical
        ? "TECHNICAL_FAILURE"
        : isQuality
          ? "QUALITY_FAILURE"
          : "QUALITY_FAILURE";
  } else if (isVerified) {
    outcome = "verified_data_failure";
    failureCategory = "VERIFIED_DATA_FAILURE";
  } else if (isQuality) {
    outcome = "quality_failure";
    failureCategory = "QUALITY_FAILURE";
  } else if (isTechnical) {
    outcome = "technical_failure";
    failureCategory = "TECHNICAL_FAILURE";
  }

  if (input.pilotEnabled) {
    await appendPilotEvent({
      keyword: input.keyword,
      outcome: outcome as never,
      failureCategory,
      message: msg,
      geminiError: /gemini|timeout|fetch failed/i.test(msg),
      jsonParseError: /JSON|parse/i.test(msg),
    }).catch(() => undefined);
  }

  return {
    result: {
      keyword: input.keyword,
      ok: false,
      held: isHold,
      error: msg,
      outcome,
    },
  };
}

export async function publishBulkKeyword(
  store: Store,
  keywordId: string,
  opts: { mutator: typeof import("./db").updateStore }
) {
  const found = findKeyword(store, keywordId);
  if (!found) return { ok: false, error: "키워드를 찾을 수 없습니다." };
  if (found.keyword.status === "published") return { ok: false, error: "이미 발행된 키워드입니다." };
  const createBlock = checkCanCreatePost(store.settings, store.posts);
  if (createBlock) return { ok: false, error: createBlock };
  const publishBlock = checkCanPublish(store.settings);
  if (publishBlock) return { ok: false, error: publishBlock };

  const claimed = await claimBulkKeyword(opts.mutator, keywordId, "manual");
  if (!claimed) return { ok: false, error: "이미 작성 중이거나 발행된 키워드입니다." };
  try {
    const post = await generateAndSave(claimed.store, claimed.group, claimed.keyword);
    const accepted = await finishBulkPublish(opts.mutator, keywordId, claimed.claim, post);
    if (!accepted) return { ok: false, keyword: claimed.keyword.keyword, error: "다른 작업이 먼저 발행했습니다." };
    await notifyPostIndexed(post.slug);
    return { ok: true, keyword: claimed.keyword.keyword };
  } catch (err) {
    const message = err instanceof Error ? err.message : "발행 실패";
    await failBulkClaim(opts.mutator, keywordId, claimed.claim, message);
    return { ok: false, keyword: claimed.keyword.keyword, error: message };
  }
}

function findKeyword(store: Store, id: string) {
  for (const group of store.bulkPublish.groups) {
    const keyword = group.keywords.find((item) => item.id === id);
    if (keyword) return { group, keyword };
  }
  return null;
}

function stillOwnsClaim(keyword: BulkKeyword | undefined, claim: string) {
  if (!keyword) return false;
  if (keyword.status === "published") return false;
  if (keyword.processingClaim && keyword.processingClaim !== claim) return false;
  return keyword.status === "processing";
}

async function claimBulkKeyword(
  mutator: typeof import("./db").updateStore,
  keywordId: string,
  mode: "due" | "manual"
) {
  const claim = uid();
  let owned = false;
  const store = await mutator((s) => {
    const found = findKeyword(s, keywordId);
    if (!found) return;
    const allowed =
      mode === "due"
        ? canClaimDueKeyword(found.keyword.status, found.keyword.processingAt)
        : canClaimManualKeyword(found.keyword.status, found.keyword.processingAt);
    if (!allowed) return;
    found.keyword.status = "processing";
    found.keyword.processingAt = new Date().toISOString();
    found.keyword.processingClaim = claim;
    found.keyword.error = undefined;
    owned = true;
  });
  const found = findKeyword(store, keywordId);
  if (!owned || !found || found.keyword.processingClaim !== claim) return null;
  return { claim, store, group: found.group, keyword: found.keyword };
}

async function finishBulkPublish(
  mutator: typeof import("./db").updateStore,
  keywordId: string,
  claim: string,
  post: Post
) {
  let accepted = false;
  await mutator((s) => {
    const found = findKeyword(s, keywordId);
    if (!stillOwnsClaim(found?.keyword, claim)) return;
    if (!s.posts.some((row) => row.id === post.id)) s.posts.unshift(post);
    if (found) {
      found.keyword.status = "published";
      found.keyword.postId = post.id;
      found.keyword.publishedAt = post.publishedAt || new Date().toISOString();
      found.keyword.error = undefined;
      found.keyword.processingClaim = undefined;
      found.keyword.processingAt = undefined;
    }
    accepted = true;
  });
  return accepted;
}

async function failBulkClaim(
  mutator: typeof import("./db").updateStore,
  keywordId: string,
  claim: string,
  message: string
) {
  await mutator((s) => {
    const found = findKeyword(s, keywordId);
    if (!stillOwnsClaim(found?.keyword, claim)) return;
    found!.keyword.status = "failed";
    found!.keyword.error = message;
    found!.keyword.processingClaim = undefined;
    found!.keyword.processingAt = undefined;
  });
}

async function releaseBulkClaim(
  mutator: typeof import("./db").updateStore,
  keywordId: string,
  claim: string,
  status: BulkKeyword["status"]
) {
  await mutator((s) => {
    const found = findKeyword(s, keywordId);
    if (!stillOwnsClaim(found?.keyword, claim)) return;
    found!.keyword.status = status;
    found!.keyword.processingClaim = undefined;
    found!.keyword.processingAt = undefined;
  });
}

async function generateAndSave(
  store: Store,
  group: BulkGroup,
  item: BulkKeyword,
  opts?: { pilotMode?: boolean; pilot?: BulkPilotConfig }
): Promise<Post> {
  const keywordBan = bannedContentError(
    store.settings.publishBannedKeywords,
    item.keyword,
    group.vendorName,
    group.extraPrompt
  );
  if (keywordBan) throw new Error(keywordBan);
  const cats = store.categories || [];
  const category = ensureCategorySlug(group.category, cats);
  const cat = getCategory(category, cats);
  const apiKey = store.settings.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) throw new Error("제미나이 API 키가 없습니다.");
  const place = extractPlaceName(item.keyword) || "";
  const vendor =
    (group.vendorId && store.adVendors?.find((row) => row.id === group.vendorId)) ||
    (group.vendorName
      ? store.adVendors?.find((row) => row.name === group.vendorName)
      : null) ||
    null;

  const article = await generateBulkArticle({
    store,
    group,
    item,
    category,
    categoryName: cat?.name,
    categoryNotes: cat?.geminiNotes,
    vendor,
    apiKey,
    pilotMode: Boolean(opts?.pilotMode),
    pilotAllowedIndustryIds: opts?.pilot?.allowedIndustryIds,
  });

  if (article.generationMode === "held" || article.generationLog.publishDecision === "HOLD") {
    const reason =
      article.generationLog.fallbackReason ||
      article.generationLog.errors.join("; ") ||
      "validation fail";
    if (/INDUSTRY_UNRESOLVED|INDUSTRY_NOT_ALLOWED/.test(reason)) {
      throw new Error(reason);
    }
    throw new Error(
      `발행 HOLD (${article.generationLog.failureCategory || "QUALITY_FAILURE"}): ${reason}`
    );
  }

  // Pilot: never expand via silent legacy when industry was forced — already blocked in pipeline.
  if (
    opts?.pilotMode &&
    (article.generationMode === "legacy" || article.generationMode === "legacy_fallback")
  ) {
    // Still publish if technical policy allowed legacy, but metrics mark legacy_fallback upstream.
  }

  const generatedBan = bannedContentError(
    store.settings.publishBannedKeywords,
    collectPublishText({
      title: article.title,
      excerpt: article.excerpt,
      bodyHtml: article.bodyHtml,
      focusKeyword: item.keyword,
      tags: article.tags,
    })
  );
  if (generatedBan) throw new Error(generatedBan);
  const now = new Date().toISOString();
  let slug = articleSlug(article.slugHint, item.keyword);
  if (store.posts.some((p) => p.slug === slug && p.status === "published")) {
    throw new Error(`SLUG_EXISTS: 동일 slug 공개글 존재 — overwrite/suffix 금지 (${slug})`);
  }
  if (store.posts.some((p) => p.status === "published" && (p.focusKeyword || "").trim() === item.keyword.trim())) {
    throw new Error(`KEYWORD_EXISTS: 동일 focusKeyword 공개글 존재 — ${item.keyword}`);
  }
  const photos = pickRandomPostImages(group.imagePool || [], group.imageCountMin || 1, group.imageCountMax || 3);
  const youtube = preferYoutubePair(item, group);
  const post = applyGenerationMeta(
    {
      id: uid(),
      slug,
      title: article.title,
      excerpt: article.excerpt || "",
      bodyHtml: cleanHtml(
        ensureVendorSlots(
          attachLocalFactBlocks({
            html: article.bodyHtml || "",
            place: extractPlaceName(article.title, item.keyword) || place,
            keyword: item.keyword,
            categoryName: cat?.name,
            slug: article.slugHint,
            title: article.title,
          })
        )
      ),
      category,
      tags: article.tags || [],
      coverImage: photos.cover,
      extraImages: photos.extras,
      focusKeyword: item.keyword,
      faqItems: article.faqItems,
      regionInfo: article.regionInfo,
      nearbyAreas: parseNameList(article.nearbyAreas),
      nearbyStations: parseNameList(article.nearbyStations),
      status: "published",
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
      theme: "art-blog",
      region: extractPlaceName(article.title, item.keyword) || undefined,
      vendorName: group.vendorName,
      vendorPhone: group.vendorPhone,
      vendorWebsite: group.vendorWebsite,
      vendorKakao: group.vendorKakao,
      vendorPlaceUrl: group.vendorPlaceUrl,
      vendorId: group.vendorId,
      vendorIds: group.vendorIds || (group.vendorId ? [group.vendorId] : []),
      youtubeUrl1: youtube.youtubeUrl1,
      youtubeUrl2: youtube.youtubeUrl2,
    },
    article
  );
  return post;
}

export function sanitizeGroupsInput(raw: unknown, categories: Category[]): BulkGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Partial<BulkGroup> & { text?: string };
      const group = normalizeGroup({
        ...item,
        category: ensureCategorySlug(item.category, categories),
        keywords: item.keywords,
      });
      if (!group) return null;
      if (typeof item.text === "string" && item.text.trim()) {
        return appendKeywords(group, parseKeywordList(item.text)).group;
      }
      return group;
    })
    .filter((item): item is BulkGroup => Boolean(item));
}

export function sanitizeScheduleInput(raw: unknown, prev: BulkSchedule): BulkSchedule {
  const body = raw && typeof raw === "object" ? (raw as Partial<BulkSchedule>) : {};
  return normalizeBulkPublish({
    schedule: {
      ...prev,
      enabled: typeof body.enabled === "boolean" ? body.enabled : prev.enabled,
      startHour: body.startHour ?? prev.startHour,
      endHour: body.endHour ?? prev.endHour,
      planDate: prev.planDate,
    },
    groups: [],
  }).schedule;
}

export function sanitizePilotInput(raw: unknown, prev?: BulkPilotConfig | null): BulkPilotConfig {
  const base = normalizePilotConfig(prev);
  if (!raw || typeof raw !== "object") return base;
  const body = raw as Partial<BulkPilotConfig>;
  return normalizePilotConfig({
    ...base,
    ...body,
    enabled: typeof body.enabled === "boolean" ? body.enabled : base.enabled,
    startedAt:
      typeof body.enabled === "boolean" && body.enabled && !base.startedAt
        ? new Date().toISOString()
        : body.startedAt ?? base.startedAt,
  });
}
