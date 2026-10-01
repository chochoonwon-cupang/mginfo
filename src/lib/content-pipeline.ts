import { getContentBlueprintStore } from "./content-blueprint-store";
import { resolveIndustryForBulk } from "./content-industry-resolve";
import { callPlanner } from "./content-planner";
import { callWriter } from "./content-writer";
import { assembleHybridBodyHtml, planForWriter } from "./hybrid-assemble";
import { buildVerifiedContext, type VerifiedContext } from "./content-verified";
import {
  computeVerifiedAvailability,
  filterPlanWithVerifiedPack,
} from "./verified-availability";
import { getVendorProfileStore } from "./vendor-profile-store";
import { isCodeRenderedBlock } from "./vendor-profile-types";
import { collectRelatedPostSummaries } from "./content-related-context";
import { validateWriterOutput, extractH2ListFromHtml } from "./content-validation";
import { generateArticle, type GenerateResult } from "./gemini";
import { DEFAULT_GEMINI_MODEL } from "./gemini-models";
import { resolveArticleStyle } from "./article-style";
import { resolveGeminiNotes } from "./gemini-notes";
import { collectRecentBodies } from "./body-uniqueness";
import {
  collectRecentTitles,
  collectTodayKeywords,
  differentiateTitle,
  findSimilarTitle,
  withUniqueArticle,
} from "./title-uniqueness";
import { parseFaqItems } from "./faq";
import { fallbackFaqItems } from "./post-seo";
import { stripGeneratedImages } from "./sanitize";
import { extractPlaceName } from "./region-geo";
import type { GenerationLog, GenerationMode, PagePlan, TokenUsage, WriterResult } from "./page-plan-types";
import type { AdVendor, BulkGroup, BulkKeyword, CategorySlug, Post, Store } from "./types";
import { PIPELINE_VERSION, PLANNER_PROMPT_VERSION, WRITER_PROMPT_VERSION, QUALITY_CODES } from "./quality-codes";
import { mergeTokenUsage } from "./gemini-usage";
import { decidePublishGate } from "./publish-gate";
import {
  findReferenceEntitiesForKeyword,
  formatReferenceFactsForPrompt,
  getReferenceStore,
} from "./reference-store";

export type PipelineArticle = GenerateResult & {
  generationMode: GenerationMode;
  generationVersion: string;
  generationLog: GenerationLog;
  industryId?: string;
  blueprintId?: string;
  blueprintVersion?: number;
  pageType?: string;
  contentAngle?: string;
  pagePlanId?: string;
  pagePlan?: PagePlan;
};

function nowIso() {
  return new Date().toISOString();
}

function emptyLog(keyword: string, mode: GenerationMode): GenerationLog {
  const t = nowIso();
  return {
    generationMode: mode,
    pipelineVersion: PIPELINE_VERSION,
    plannerPromptVersion: PLANNER_PROMPT_VERSION,
    writerPromptVersion: WRITER_PROMPT_VERSION,
    keyword,
    plannerCalls: 0,
    writerCalls: 0,
    plannerRetries: 0,
    writerRetries: 0,
    removedVerifiedBlocks: [],
    validationIssues: [],
    qualityChecks: [],
    failureCodes: [],
    errors: [],
    startedAt: t,
    finishedAt: t,
  };
}

async function runLegacyGenerate(input: {
  store: Store;
  group: BulkGroup;
  item: BulkKeyword;
  category: CategorySlug;
  categoryName?: string;
  categoryNotes?: string;
  apiKey: string;
  mode: GenerationMode;
  fallbackReason?: string;
  logBase?: GenerationLog;
  /** Use uniqueness retry wrapper (costs up to +1 Gemini). Only for pure legacy. */
  withUniqueness?: boolean;
}): Promise<PipelineArticle> {
  const writingStyle = resolveArticleStyle(input.group.writingStyle || "random", input.item.keyword);
  const avoidTitles = collectRecentTitles(input.store.posts);
  const avoidBodies = collectRecentBodies(input.store.posts);
  const avoidKeywords = collectTodayKeywords(input.store.bulkPublish.groups.flatMap((row) => row.keywords));
  const region = extractPlaceName(input.item.keyword) || "";
  const model = input.store.settings.geminiModel || DEFAULT_GEMINI_MODEL;

  const generate = (nextAvoid: string[]) =>
    generateArticle({
      topic: input.item.keyword,
      writingStyle,
      category: input.category,
      categoryName: input.categoryName,
      notes: resolveGeminiNotes("", input.categoryNotes),
      focusKeyword: input.item.keyword,
      region,
      vendorName: input.group.vendorName,
      writingTone: input.store.settings.writingTone,
      writingPersona: input.store.settings.writingPersona,
      experienceNotes: input.group.extraPrompt || "",
      avoidTitles: nextAvoid,
      avoidKeywords,
      apiKey: input.apiKey,
      model,
    });

  let article: GenerateResult;
  if (input.withUniqueness) {
    article = await withUniqueArticle(generate, avoidTitles, avoidBodies, input.item.keyword);
  } else {
    article = await generate(avoidTitles);
    if (findSimilarTitle(article.title, avoidTitles)) {
      article = { ...article, title: differentiateTitle(article.title, avoidTitles, input.item.keyword) };
    }
  }

  const log = input.logBase || emptyLog(input.item.keyword, input.mode);
  log.generationMode = input.mode;
  log.fallbackReason = input.fallbackReason;
  log.finishedAt = nowIso();
  if (input.fallbackReason) log.errors.push(input.fallbackReason);

  return {
    ...article,
    generationMode: input.mode,
    generationVersion: input.mode === "legacy_fallback" ? "legacy_fallback" : "legacy",
    generationLog: log,
  };
}

async function writeOnce(input: Parameters<typeof callWriter>[0]): Promise<{
  result: WriterResult;
  calls: number;
  tokens?: TokenUsage;
  promptVersion?: string;
  error?: string;
}> {
  try {
    const out = await callWriter(input);
    return {
      result: out.result,
      calls: out.calls,
      tokens: out.tokens,
      promptVersion: out.promptVersion,
    };
  } catch (err) {
    return {
      result: { title: "", intro: "", sections: [] },
      calls: 1,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Shared V1 Production Engine entry for Bulk / Hub Board / Editor.
 * Builds a synthetic BulkGroup and delegates to generateBulkArticle.
 */
export async function generatePipelineArticle(input: {
  store: Store;
  keyword: string;
  category: CategorySlug;
  categoryName?: string;
  categoryNotes?: string;
  writingStyle?: string;
  extraPrompt?: string;
  vendorName?: string;
  vendorPhone?: string;
  vendorWebsite?: string;
  vendorKakao?: string;
  vendorPlaceUrl?: string;
  vendorId?: string;
  vendorIds?: string[];
  industryId?: string;
  blueprintId?: string;
  vendor?: AdVendor | null;
  apiKey: string;
  siteId?: string;
  pilotMode?: boolean;
  pilotAllowedIndustryIds?: string[];
}): Promise<PipelineArticle> {
  const keyword = String(input.keyword || "").trim();
  if (!keyword) {
    throw new Error("키워드가 필요합니다.");
  }
  const vendorId =
    String(input.vendorId || input.vendor?.id || "").trim() || undefined;
  const group: BulkGroup = {
    id: `pipeline-${Date.now()}`,
    category: input.category,
    dailyLimit: 0,
    vendorName: input.vendorName || input.vendor?.name || "",
    vendorPhone: input.vendorPhone || input.vendor?.phone || "",
    vendorWebsite: input.vendorWebsite || input.vendor?.website || "",
    vendorKakao: input.vendorKakao || input.vendor?.kakao || "",
    vendorPlaceUrl: input.vendorPlaceUrl || "",
    vendorId,
    vendorIds: input.vendorIds?.length
      ? input.vendorIds
      : vendorId
        ? [vendorId]
        : [],
    writingStyle: input.writingStyle || "random",
    extraPrompt: input.extraPrompt || "",
    industryId: input.industryId,
    blueprintId: input.blueprintId,
    keywords: [],
  };
  const item: BulkKeyword = {
    id: `kw-${Date.now()}`,
    keyword,
    status: "queued",
  };
  return generateBulkArticle({
    store: input.store,
    group,
    item,
    category: input.category,
    categoryName: input.categoryName,
    categoryNotes: input.categoryNotes,
    vendor: input.vendor ?? null,
    apiKey: input.apiKey,
    siteId: input.siteId,
    pilotMode: input.pilotMode,
    pilotAllowedIndustryIds: input.pilotAllowedIndustryIds,
  });
}

export async function generateBulkArticle(input: {
  store: Store;
  group: BulkGroup;
  item: BulkKeyword;
  category: CategorySlug;
  categoryName?: string;
  categoryNotes?: string;
  vendor?: AdVendor | null;
  apiKey: string;
  siteId?: string;
  /** PHASE 9 — skip unresolved/non-allowed industries instead of legacy. */
  pilotMode?: boolean;
  pilotAllowedIndustryIds?: string[];
}): Promise<PipelineArticle> {
  const keyword = input.item.keyword;
  const log = emptyLog(keyword, "planner_writer_v1");

  let blueprintStore;
  try {
    blueprintStore = await getContentBlueprintStore();
  } catch (err) {
    const reason = `Blueprint store 로드 실패: ${err instanceof Error ? err.message : String(err)}`;
    return runLegacyGenerate({
      ...input,
      mode: "legacy_fallback",
      fallbackReason: reason,
      logBase: log,
      withUniqueness: false,
    });
  }

  const profileStore = await getVendorProfileStore();
  const profile =
    (input.vendor?.id && profileStore.profiles.find((p) => p.vendorId === input.vendor!.id)) ||
    (input.group.vendorId && profileStore.profiles.find((p) => p.vendorId === input.group.vendorId)) ||
    null;

  const resolved = resolveIndustryForBulk(blueprintStore, keyword, input.group, {
    siteId: input.siteId,
    vendorId: input.group.vendorId,
    vendorIndustryId: profile?.industryId,
  });

  if (!resolved.ok) {
    log.resolverConfidence = resolved.confidence;
    log.resolverSignals = resolved.matchedSignals;
    if (input.pilotMode) {
      log.generationMode = "held";
      log.publishDecision = "HOLD";
      log.failureCategory = "QUALITY_FAILURE";
      log.fallbackReason = `INDUSTRY_UNRESOLVED: ${resolved.reason}`;
      log.errors.push(log.fallbackReason);
      log.finishedAt = nowIso();
      return {
        title: keyword,
        excerpt: "",
        bodyHtml: "",
        tags: [keyword],
        faqItems: [],
        generationMode: "held",
        generationVersion: "held",
        generationLog: log,
      };
    }
    // unresolved / no industry → intentional legacy path (not quality FAIL)
    return runLegacyGenerate({
      ...input,
      mode: "legacy",
      fallbackReason: resolved.reason,
      logBase: { ...log, generationMode: "legacy", errors: [resolved.reason] },
      withUniqueness: true,
    });
  }

  if (
    input.pilotMode &&
    Array.isArray(input.pilotAllowedIndustryIds) &&
    input.pilotAllowedIndustryIds.length > 0 &&
    !input.pilotAllowedIndustryIds.includes(resolved.industryId)
  ) {
    log.generationMode = "held";
    log.publishDecision = "HOLD";
    log.failureCategory = "QUALITY_FAILURE";
    log.industryId = resolved.industryId;
    log.fallbackReason = `INDUSTRY_NOT_ALLOWED: Pilot 허용 업종 아님 (${resolved.industryId})`;
    log.errors.push(log.fallbackReason);
    log.finishedAt = nowIso();
    return {
      title: keyword,
      excerpt: "",
      bodyHtml: "",
      tags: [keyword],
      faqItems: [],
      generationMode: "held",
      generationVersion: "held",
      generationLog: log,
      industryId: resolved.industryId,
    };
  }

  log.industryId = resolved.industryId;
  log.blueprintId = resolved.blueprintId;
  log.blueprintVersion = resolved.pool.blueprint.version;
  log.resolverConfidence = resolved.confidence;
  log.resolverSignals = resolved.matchedSignals;

  const verifiedPack = computeVerifiedAvailability({
    blocks: resolved.pool.blocks,
    adVendor: input.vendor,
    profile,
    store: profileStore,
    keyword,
  });

  log.verifiedBlocksAvailable = verifiedPack.availableVerifiedBlocks;
  log.verifiedContextSummary = verifiedPack.verifiedContext.blocks
    .filter((b) => b.available)
    .map((b) => `${b.blockKey}:${b.matchType || "n/a"}:${b.itemCount}`)
    .join("|");

  const verified: VerifiedContext = {
    ...buildVerifiedContext(input.group, input.vendor),
    ...(verifiedPack.view
      ? {
          vendorName: verifiedPack.view.companyName,
          phone: verifiedPack.view.phone,
          address: verifiedPack.view.address,
          website: verifiedPack.view.website,
          businessHours: verifiedPack.view.businessHours,
          consultationMethod: verifiedPack.view.consultationMethod,
        }
      : {}),
    animals: verifiedPack.matchingAnimals.length ? verifiedPack.matchingAnimals : undefined,
    projectCases: verifiedPack.projects.length ? verifiedPack.projects : undefined,
  };

  let referenceFacts: ReturnType<typeof formatReferenceFactsForPrompt> = [];
  let referenceEntityIds: string[] = [];
  try {
    const refStore = await getReferenceStore();
    const entities = findReferenceEntitiesForKeyword(refStore, keyword, resolved.industryId);
    referenceFacts = formatReferenceFactsForPrompt(entities);
    referenceEntityIds = [...new Set(referenceFacts.map((f) => f.entityId))];
  } catch {
    referenceFacts = [];
    referenceEntityIds = [];
  }
  log.referenceEntityIds = referenceEntityIds;

  const related = collectRelatedPostSummaries(input.store.posts, keyword, resolved.industryId, 8);
  const writingStyle = resolveArticleStyle(input.group.writingStyle || "random", keyword);
  const model = input.store.settings.geminiModel || DEFAULT_GEMINI_MODEL;
  const avoidTitles = collectRecentTitles(input.store.posts);
  const avoidBodies = collectRecentBodies(input.store.posts);
  const existingH2Lists = input.store.posts.slice(0, 40).map((p) => extractH2ListFromHtml(p.bodyHtml || ""));

  let plan: PagePlan;
  try {
    const planned = await callPlanner({
      apiKey: input.apiKey,
      model,
      keyword,
      pool: resolved.pool,
      related,
      vendorName: verifiedPack.view?.companyName || input.group.vendorName,
      hasVerifiedVendor: Boolean(verified.vendorName && (verified.address || verified.phone)),
      hasVerifiedAnimals: Boolean(verified.animals || verified.projectCases),
      regionalFacts: { region: extractPlaceName(keyword) || "", facts: [] },
      availableVerifiedBlocks: verifiedPack.availableVerifiedBlocks,
      verifiedContext: verifiedPack.verifiedContext,
    });
    plan = planned.plan;
    log.plannerCalls = planned.calls;
    log.plannerRetries = Math.max(0, planned.calls - 1);
    log.plannerModel = model;
    log.plannerTokens = planned.tokens;
    log.plannerPromptVersion = planned.promptVersion || PLANNER_PROMPT_VERSION;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.errors.push(reason);
    log.failureCodes = [QUALITY_CODES.PLAN_SCHEMA_INVALID];
    log.fallbackCode = QUALITY_CODES.PLAN_SCHEMA_INVALID;
    log.failureCategory = "TECHNICAL_FAILURE";
    log.publishDecision = "HOLD";
    log.finishedAt = nowIso();
    return runLegacyGenerate({
      ...input,
      mode: "legacy_fallback",
      fallbackReason: `Planner 실패: ${reason}`,
      logBase: log,
      withUniqueness: false,
    });
  }

  log.pagePlanId = plan.planId;
  log.pageType = plan.pageType;
  log.contentAngle = plan.contentAngle;
  log.contentStrategySummary = plan.contentStrategy?.summary;

  const filtered = filterPlanWithVerifiedPack(plan, resolved.pool.blocks, verifiedPack);
  log.removedVerifiedBlocks = filtered.removed;
  log.verifiedBlocksRemoved = filtered.removed;
  plan = filtered.plan;

  if (plan.sections.length < 4) {
    const reason = `Verified 필터 후 sections ${plan.sections.length}개 — HOLD`;
    log.errors.push(reason);
    log.failureCodes = ["SECTIONS_COLLAPSED_VERIFIED"];
    log.failureCategory = "VERIFIED_DATA_FAILURE";
    log.publishDecision = "HOLD";
    log.finishedAt = nowIso();
    return {
      title: plan.titleHint || keyword,
      excerpt: "",
      bodyHtml: "",
      tags: [keyword],
      generationMode: "held",
      generationVersion: "held",
      generationLog: log,
      industryId: resolved.industryId,
      blueprintId: resolved.blueprintId,
      blueprintVersion: resolved.pool.blueprint.version,
      pageType: plan.pageType,
      contentAngle: plan.contentAngle,
      pagePlanId: plan.planId,
      pagePlan: plan,
    };
  }

  const writerPlan = planForWriter(plan);
  if (writerPlan.sections.length < 2) {
    const reason = `AI 작성 sections가 ${writerPlan.sections.length}개뿐임 — HOLD`;
    log.errors.push(reason);
    log.failureCodes = ["SECTIONS_COLLAPSED_VERIFIED"];
    log.failureCategory = "VERIFIED_DATA_FAILURE";
    log.publishDecision = "HOLD";
    log.finishedAt = nowIso();
    return {
      title: plan.titleHint || keyword,
      excerpt: "",
      bodyHtml: "",
      tags: [keyword],
      generationMode: "held",
      generationVersion: "held",
      generationLog: log,
      industryId: resolved.industryId,
      blueprintId: resolved.blueprintId,
      blueprintVersion: resolved.pool.blueprint.version,
      pageType: plan.pageType,
      contentAngle: plan.contentAngle,
      pagePlanId: plan.planId,
      pagePlan: plan,
    };
  }

  const upcomingVerifiedBlocks = plan.sections
    .filter((s) => isCodeRenderedBlock(s.blockKey))
    .map((s) => s.blockKey);

  const writerInput = {
    apiKey: input.apiKey,
    model,
    plan: writerPlan,
    verified,
    writingStyle,
    writingTone: input.store.settings.writingTone,
    writingPersona: input.store.settings.writingPersona,
    experienceNotes: input.group.extraPrompt || "",
    categoryName: input.categoryName,
    avoidTitles,
    upcomingVerifiedBlocks,
    referenceFacts,
  };

  let written = await writeOnce(writerInput);
  log.writerCalls = written.calls;
  log.writerModel = model;
  log.writerTokens = written.tokens;
  log.writerPromptVersion = written.promptVersion || WRITER_PROMPT_VERSION;

  if (written.error) {
    const retry = await writeOnce({
      ...writerInput,
      avoidTitles: [...avoidTitles, "이전 응답 Schema 실패 — 새 구조화 JSON"],
    });
    log.writerCalls += retry.calls;
    log.writerRetries = 1;
    log.writerTokens = mergeTokenUsage(log.writerTokens, retry.tokens);
    written = retry;
    if (written.error) {
      log.errors.push(written.error);
      log.failureCodes = [QUALITY_CODES.WRITER_SCHEMA_INVALID];
      log.fallbackCode = QUALITY_CODES.WRITER_SCHEMA_INVALID;
      log.finishedAt = nowIso();
      return runLegacyGenerate({
        ...input,
        mode: "legacy_fallback",
        fallbackReason: `Writer 실패: ${written.error}`,
        logBase: log,
        withUniqueness: false,
      });
    }
  }

  let writerResult = written.result;
  let hybrid = assembleHybridBodyHtml({ plan, writer: writerResult, pack: verifiedPack });
  let bodyHtml = stripGeneratedImages(hybrid.bodyHtml);
  log.verifiedBlocksRendered = hybrid.verifiedBlocksRendered;
  if (hybrid.verifiedBlocksRemoved.length) {
    log.verifiedBlocksRemoved = [...(log.verifiedBlocksRemoved || []), ...hybrid.verifiedBlocksRemoved];
  }

  const hasVerifiedVendorFacts = Boolean(verified.vendorName && (verified.address || verified.phone));
  const relatedPosts = input.store.posts.slice(0, 20).map((p) => ({
    title: p.title,
    bodyHtml: p.bodyHtml,
    focusKeyword: p.focusKeyword,
  }));

  let validation = validateWriterOutput({
    plan: writerPlan,
    writer: writerResult,
    bodyHtml,
    existingTitles: avoidTitles,
    existingBodies: avoidBodies,
    existingH2Lists,
    bannedKeywords: input.store.settings.publishBannedKeywords,
    hasVerifiedVendorFacts,
    focusKeyword: keyword,
    relatedPosts,
  });
  log.validationIssues = validation.issues.map((i) => ({
    code: i.code,
    severity: i.severity,
    message: i.message,
  }));
  log.qualityChecks = validation.checks;
  log.failureCodes = validation.checks.filter((c) => c.severity === "FAIL").map((c) => c.code);

  if (!validation.ok && log.writerRetries < 1) {
    const retry = await writeOnce({
      ...writerInput,
      avoidTitles: [...avoidTitles, writerResult.title],
    });
    log.writerCalls += retry.calls;
    log.writerRetries = 1;
    log.writerTokens = mergeTokenUsage(log.writerTokens, retry.tokens);
    if (retry.error) {
      log.errors.push(retry.error);
      log.failureCodes = [...(log.failureCodes || []), QUALITY_CODES.WRITER_SCHEMA_INVALID];
      log.fallbackCode = QUALITY_CODES.WRITER_SCHEMA_INVALID;
      log.finishedAt = nowIso();
      return runLegacyGenerate({
        ...input,
        mode: "legacy_fallback",
        fallbackReason: `Writer 재시도 실패: ${retry.error}`,
        logBase: log,
        withUniqueness: false,
      });
    }
    writerResult = retry.result;
    hybrid = assembleHybridBodyHtml({ plan, writer: writerResult, pack: verifiedPack });
    bodyHtml = stripGeneratedImages(hybrid.bodyHtml);
    log.verifiedBlocksRendered = hybrid.verifiedBlocksRendered;
    validation = validateWriterOutput({
      plan: writerPlan,
      writer: writerResult,
      bodyHtml,
      existingTitles: avoidTitles,
      existingBodies: avoidBodies,
      existingH2Lists,
      bannedKeywords: input.store.settings.publishBannedKeywords,
      hasVerifiedVendorFacts,
      focusKeyword: keyword,
      relatedPosts,
    });
    log.validationIssues = validation.issues.map((i) => ({
      code: i.code,
      severity: i.severity,
      message: i.message,
    }));
    log.qualityChecks = validation.checks;
    log.failureCodes = validation.checks.filter((c) => c.severity === "FAIL").map((c) => c.code);
  }

  // PHASE 7: QUALITY/VERIFIED FAIL → HOLD (no legacy_fallback content publish).
  // TECHNICAL still used legacy_fallback earlier in the pipeline.
  if (!validation.ok) {
    const reason = validation.issues
      .filter((i) => i.severity === "error")
      .map((i) => i.message)
      .join("; ");
    log.errors.push(reason);
    log.fallbackCode = log.failureCodes?.[0];
    const gate = decidePublishGate({
      validationOk: false,
      hasFail: true,
      hasWarn: validation.hasWarn,
      failureCodes: log.failureCodes,
    });
    log.publishDecision = gate.decision;
    log.failureCategory = gate.category;
    log.finishedAt = nowIso();

    if (gate.allowLegacyFallback) {
      return runLegacyGenerate({
        ...input,
        mode: "legacy_fallback",
        fallbackReason: `Validation 실패(technical): ${reason}`,
        logBase: log,
        withUniqueness: false,
      });
    }

    return {
      title: validation.fixed.title || plan.titleHint || keyword,
      excerpt: validation.fixed.excerpt || "",
      bodyHtml,
      tags: [keyword],
      faqItems: validation.fixed.faqItems,
      generationMode: "held",
      generationVersion: "held",
      generationLog: log,
      industryId: resolved.industryId,
      blueprintId: resolved.blueprintId,
      blueprintVersion: resolved.pool.blueprint.version,
      pageType: plan.pageType,
      contentAngle: plan.contentAngle,
      pagePlanId: plan.planId,
      pagePlan: plan,
    };
  }

  const gatePass = decidePublishGate({
    validationOk: true,
    hasFail: false,
    hasWarn: validation.hasWarn,
    failureCodes: [],
  });
  log.publishDecision = gatePass.decision;

  let title = validation.fixed.title;
  if (findSimilarTitle(title, avoidTitles)) {
    title = differentiateTitle(title, avoidTitles, keyword);
  }

  // Keep hybrid assembly (validation may only wrap intro mildly on AI body)
  bodyHtml = stripGeneratedImages(
    assembleHybridBodyHtml({ plan, writer: validation.fixed, pack: verifiedPack }).bodyHtml
  );
  const tags = Array.isArray(validation.fixed.tags) ? [...validation.fixed.tags] : [];
  if (keyword && !tags.includes(keyword)) tags.unshift(keyword);

  const faqItems =
    parseFaqItems(validation.fixed.faqItems) ||
    fallbackFaqItems(
      {
        id: "",
        slug: "",
        title,
        excerpt: validation.fixed.excerpt || "",
        bodyHtml,
        category: input.category,
        tags,
        focusKeyword: keyword,
        status: "draft",
        publishedAt: null,
        createdAt: "",
        updatedAt: "",
      },
      input.categoryName
    );

  log.finishedAt = nowIso();
  log.generationMode = "planner_writer_v1";

  return {
    title,
    excerpt: validation.fixed.excerpt || "",
    bodyHtml,
    tags: tags.slice(0, 8),
    slugHint: validation.fixed.slugHint,
    faqItems: faqItems.length ? faqItems : undefined,
    regionInfo: validation.fixed.regionInfo,
    nearbyAreas: validation.fixed.nearbyAreas,
    nearbyStations: validation.fixed.nearbyStations,
    generationMode: "planner_writer_v1",
    generationVersion: "planner_writer_v1",
    generationLog: log,
    industryId: resolved.industryId,
    blueprintId: resolved.blueprintId,
    blueprintVersion: resolved.pool.blueprint.version,
    pageType: plan.pageType,
    contentAngle: plan.contentAngle,
    pagePlanId: plan.planId,
    pagePlan: plan,
  };
}

export function applyGenerationMeta(post: Post, article: PipelineArticle): Post {
  return {
    ...post,
    industryId: article.industryId,
    blueprintId: article.blueprintId,
    blueprintVersion: article.blueprintVersion,
    pageType: article.pageType,
    contentAngle: article.contentAngle,
    pagePlanId: article.pagePlanId,
    generationVersion: article.generationVersion,
    generationMode: article.generationMode,
    generationLog: article.generationLog,
  };
}
