/**
 * Canary publish — single-keyword production publish without enabling Bulk schedule.
 * PHASE 8.
 */
import { applyGenerationMeta, generateBulkArticle, type PipelineArticle } from "./content-pipeline";
import { notifyPostIndexed } from "./indexnow";
import { checkCanCreatePost, checkCanPublish } from "./publish-limits";
import { bannedContentError, collectPublishText } from "./banned-keywords";
import { extractPlaceName, parseNameList } from "./region-geo";
import { cleanHtml } from "./sanitize";
import { uid } from "./slug";
import { attachLocalFactBlocks } from "./article-blocks";
import { pickRandomPostImages } from "./image-pool";
import { ensureVendorSlots } from "./vendor-slots";
import { ensureCategorySlug, getCategory } from "./categories";
import { runPrePublishGate, type PrePublishResult } from "./pre-publish-gate";
import type { BulkGroup, BulkKeyword, Post, Store } from "./types";

export type CanaryPublishResult = {
  ok: boolean;
  skipped?: boolean;
  held?: boolean;
  keyword: string;
  slug?: string;
  postId?: string;
  url?: string;
  error?: string;
  prePublish?: PrePublishResult;
  article?: PipelineArticle;
  indexNow?: { ok: boolean; detail?: string };
  publishedAt?: string;
};

function canaryGroup(input: {
  keyword: string;
  vendorId?: string;
  vendorName?: string;
  industryId?: string;
  writingStyle?: string;
  category?: string;
}): { group: BulkGroup; item: BulkKeyword } {
  const item: BulkKeyword = {
    id: uid(),
    keyword: input.keyword,
    status: "queued",
  };
  const group: BulkGroup = {
    id: `canary-${uid().slice(0, 8)}`,
    category: (input.category || "life") as never,
    dailyLimit: 1,
    keywords: [item],
    writingStyle: input.writingStyle || "magazine",
    vendorId: input.vendorId,
    vendorName: input.vendorName,
    industryId: input.industryId,
    imageCountMin: 0,
    imageCountMax: 0,
    imagePool: [],
  };
  return { group, item };
}

/**
 * Generate + optionally save one canary post.
 * Never toggles Bulk schedule.enabled.
 * Never overwrites existing published slug/keyword.
 */
export async function publishCanaryKeyword(input: {
  store: Store;
  keyword: string;
  vendorId?: string;
  vendorName?: string;
  industryId?: string;
  writingStyle?: string;
  category?: string;
  /** When true, only generate+gate — do not write Post / IndexNow */
  dryRun?: boolean;
  mutator: typeof import("./db").updateStore;
  siteOrigin?: string;
}): Promise<CanaryPublishResult> {
  const keyword = String(input.keyword || "").trim();
  if (!keyword) return { ok: false, keyword: "", error: "keyword 필요" };

  const createBlock = checkCanCreatePost(input.store.settings, input.store.posts);
  if (createBlock) return { ok: false, keyword, error: createBlock };
  const publishBlock = checkCanPublish(input.store.settings);
  if (publishBlock) return { ok: false, keyword, error: publishBlock };

  const keywordBan = bannedContentError(
    input.store.settings.publishBannedKeywords,
    keyword,
    input.vendorName
  );
  if (keywordBan) return { ok: false, keyword, error: keywordBan };

  const cats = input.store.categories || [];
  const category = ensureCategorySlug(input.category || "life", cats);
  const cat = getCategory(category, cats);
  const apiKey = input.store.settings.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) return { ok: false, keyword, error: "제미나이 API 키 없음" };

  const vendor =
    (input.vendorId && input.store.adVendors?.find((row) => row.id === input.vendorId)) ||
    (input.vendorName
      ? input.store.adVendors?.find((row) => row.name === input.vendorName)
      : null) ||
    null;

  const { group, item } = canaryGroup({
    keyword,
    vendorId: vendor?.id || input.vendorId,
    vendorName: vendor?.name || input.vendorName,
    industryId: input.industryId,
    writingStyle: input.writingStyle,
    category,
  });

  const article = await generateBulkArticle({
    store: input.store,
    group,
    item,
    category,
    categoryName: cat?.name,
    categoryNotes: cat?.geminiNotes,
    vendor,
    apiKey,
  });

  const pre = runPrePublishGate({
    article,
    keyword,
    existingPosts: input.store.posts,
  });

  if (pre.decision === "SKIP") {
    return {
      ok: false,
      skipped: true,
      keyword,
      slug: pre.slug,
      error: pre.reason,
      prePublish: pre,
      article,
    };
  }

  if (pre.decision === "HOLD" || !pre.ok) {
    return {
      ok: false,
      held: true,
      keyword,
      slug: pre.slug,
      error: pre.reason || "HOLD",
      prePublish: pre,
      article,
    };
  }

  if (input.dryRun) {
    return {
      ok: true,
      keyword,
      slug: pre.slug,
      prePublish: pre,
      article,
    };
  }

  const generatedBan = bannedContentError(
    input.store.settings.publishBannedKeywords,
    collectPublishText({
      title: article.title,
      excerpt: article.excerpt,
      bodyHtml: article.bodyHtml,
      focusKeyword: keyword,
      tags: article.tags,
    })
  );
  if (generatedBan) {
    return { ok: false, held: true, keyword, error: generatedBan, prePublish: pre, article };
  }

  const now = new Date().toISOString();
  const place = extractPlaceName(keyword) || "";
  const photos = pickRandomPostImages(group.imagePool || [], 0, 0);
  const post = applyGenerationMeta(
    {
      id: uid(),
      slug: pre.slug,
      title: article.title,
      excerpt: article.excerpt || "",
      bodyHtml: cleanHtml(
        ensureVendorSlots(
          attachLocalFactBlocks({
            html: article.bodyHtml || "",
            place: extractPlaceName(article.title, keyword) || place,
            keyword,
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
      focusKeyword: keyword,
      faqItems: article.faqItems,
      regionInfo: article.regionInfo,
      nearbyAreas: parseNameList(article.nearbyAreas),
      nearbyStations: parseNameList(article.nearbyStations),
      status: "published",
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
      theme: "art-blog",
      region: extractPlaceName(article.title, keyword) || undefined,
      vendorName: group.vendorName || vendor?.name,
      vendorPhone: vendor?.phone,
      vendorWebsite: vendor?.website,
      vendorKakao: vendor?.kakao,
      vendorId: group.vendorId || vendor?.id,
      vendorIds: group.vendorId || vendor?.id ? [group.vendorId || vendor!.id] : [],
    },
    article
  );

  // Final race check inside mutator
  let accepted = false;
  let savedSlug = "";
  let savedId = "";
  await input.mutator((s) => {
    if (s.posts.some((p) => p.slug === post.slug && p.status === "published")) return;
    if (s.posts.some((p) => p.status === "published" && (p.focusKeyword || "").trim() === keyword)) return;
    s.posts.unshift(post);
    accepted = true;
    savedSlug = post.slug;
    savedId = post.id;
  });

  if (!accepted || !savedSlug) {
    return {
      ok: false,
      skipped: true,
      keyword,
      slug: pre.slug,
      error: "동시성: 이미 동일 slug/keyword가 발행됨",
      prePublish: pre,
      article,
    };
  }

  let indexNow: { ok: boolean; detail?: string } | undefined;
  try {
    indexNow = await notifyPostIndexed(savedSlug);
  } catch (err) {
    indexNow = { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }

  const origin = (input.siteOrigin || process.env.NEXT_PUBLIC_SITE_URL || "https://mginfo.vercel.app").replace(
    /\/$/,
    ""
  );

  return {
    ok: true,
    keyword,
    slug: savedSlug,
    postId: savedId,
    url: `${origin}/posts/${savedSlug}`,
    prePublish: pre,
    article,
    indexNow,
    publishedAt: now,
  };
}
