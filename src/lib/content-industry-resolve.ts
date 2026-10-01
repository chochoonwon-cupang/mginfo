import type { ContentBlueprintStore, Industry } from "./content-blueprint-types";
import { resolveBlueprintPool } from "./content-blueprint-store";
import type { BulkGroup } from "./types";

export type ResolvedBlueprint = NonNullable<ReturnType<typeof resolveBlueprintPool>>;

/** Deterministic confidence — not an AI probability. */
export type ResolverConfidence = "exact" | "strong" | "weak" | "unresolved";

export type IndustryResolveResult =
  | {
      ok: true;
      industryId: string;
      blueprintId: string;
      pool: ResolvedBlueprint;
      reason: string;
      confidence: ResolverConfidence;
      matchedSignals: string[];
    }
  | {
      ok: false;
      reason: string;
      confidence: "unresolved";
      matchedSignals: string[];
    };

type ScoredIndustry = {
  industry: Industry;
  score: number;
  signals: string[];
  confidence: ResolverConfidence;
};

function scoreIndustryAgainstKeyword(industry: Industry, keyword: string): ScoredIndustry | null {
  const hints = industry.resolverHints;
  if (!hints) return null;
  const kw = String(keyword || "").trim();
  if (!kw) return null;

  const negatives = hints.negativeTerms || [];
  for (const neg of negatives) {
    if (neg && kw.includes(neg)) {
      return null;
    }
  }

  const signals: string[] = [];
  let score = 0;

  for (const term of hints.serviceTerms || []) {
    if (term && kw.includes(term)) {
      score += 40;
      signals.push(`serviceTerm:${term}`);
    }
  }
  for (const term of hints.keywords || []) {
    if (term && kw.includes(term)) {
      score += 20;
      signals.push(`keyword:${term}`);
    }
  }
  for (const term of hints.aliases || []) {
    if (term && kw.includes(term)) {
      score += 15;
      signals.push(`alias:${term}`);
    }
  }

  if (score <= 0) return null;

  let confidence: ResolverConfidence = "weak";
  if (score >= 40 && signals.some((s) => s.startsWith("serviceTerm:"))) confidence = "exact";
  else if (score >= 30) confidence = "strong";
  else confidence = "weak";

  return { industry, score, signals, confidence };
}

/**
 * Generic deterministic industry matcher driven by Industry.resolverHints data.
 * No Gemini. Prefer explicit blueprint/industry/vendor profile signals.
 */
export function resolveIndustryForBulk(
  store: ContentBlueprintStore,
  keyword: string,
  group: BulkGroup,
  opts?: { siteId?: string; vendorId?: string; vendorIndustryId?: string }
): IndustryResolveResult {
  const kw = String(keyword || "").trim();
  const explicitBlueprintId = String(group.blueprintId || "").trim();
  const explicitIndustryId = String(group.industryId || "").trim();
  const vendorIndustryId = String(opts?.vendorIndustryId || "").trim();

  if (explicitBlueprintId) {
    const pool = resolveBlueprintPool(store, explicitBlueprintId, {
      siteId: opts?.siteId,
      vendorId: opts?.vendorId || group.vendorId,
    });
    if (!pool?.blueprint || pool.blueprint.status === "disabled") {
      return {
        ok: false,
        reason: `지정 Blueprint를 쓸 수 없습니다: ${explicitBlueprintId}`,
        confidence: "unresolved",
        matchedSignals: [],
      };
    }
    if (pool.blueprint.status !== "active") {
      return {
        ok: false,
        reason: `Blueprint가 active가 아닙니다: ${explicitBlueprintId}`,
        confidence: "unresolved",
        matchedSignals: [],
      };
    }
    return {
      ok: true,
      industryId: pool.blueprint.industryId,
      blueprintId: pool.blueprint.id,
      pool,
      reason: "bulk_group.blueprintId",
      confidence: "exact",
      matchedSignals: [`blueprintId:${explicitBlueprintId}`],
    };
  }

  let industryId = explicitIndustryId;
  let confidence: ResolverConfidence = explicitIndustryId ? "exact" : "unresolved";
  let matchedSignals: string[] = explicitIndustryId ? [`bulk_group.industryId:${explicitIndustryId}`] : [];
  let reason = explicitIndustryId ? "bulk_group.industryId" : "";

  if (!industryId && vendorIndustryId) {
    industryId = vendorIndustryId;
    confidence = "strong";
    matchedSignals = [`vendorProfile.industryId:${vendorIndustryId}`];
    reason = "vendorProfile.industryId";
  }

  if (!industryId) {
    const scored = store.industries
      .filter((row) => row.status === "active")
      .map((ind) => scoreIndustryAgainstKeyword(ind, kw))
      .filter(Boolean) as ScoredIndustry[];
    scored.sort((a, b) => b.score - a.score);

    if (!scored.length) {
      return {
        ok: false,
        reason: "업종 unresolved — 키워드 힌트 없음",
        confidence: "unresolved",
        matchedSignals: [],
      };
    }

    const best = scored[0];
    const second = scored[1];
    // Ambiguous: two industries close in score → unresolved rather than force
    if (second && best.score - second.score < 15 && best.confidence !== "exact") {
      return {
        ok: false,
        reason: `업종 ambiguous — ${best.industry.id} vs ${second.industry.id}`,
        confidence: "unresolved",
        matchedSignals: [...best.signals, ...second.signals],
      };
    }
    // Weak-only match without serviceTerm → unresolved (don't force pet/demolition)
    if (best.confidence === "weak") {
      return {
        ok: false,
        reason: `업종 weak match only (${best.industry.id}) — unresolved`,
        confidence: "unresolved",
        matchedSignals: best.signals,
      };
    }

    industryId = best.industry.id;
    confidence = best.confidence;
    matchedSignals = best.signals;
    reason = "resolverHints";
  }

  const industry = store.industries.find((row) => row.id === industryId && row.status === "active");
  if (!industry) {
    return {
      ok: false,
      reason: `업종이 active가 아닙니다: ${industryId}`,
      confidence: "unresolved",
      matchedSignals,
    };
  }

  const blueprint =
    store.blueprints.find((row) => row.industryId === industryId && row.status === "active") ||
    store.blueprints.find((row) => row.industryId === industryId);
  if (!blueprint || blueprint.status === "disabled") {
    return {
      ok: false,
      reason: `업종에 사용 가능한 Blueprint 없음: ${industryId}`,
      confidence: "unresolved",
      matchedSignals,
    };
  }
  if (blueprint.status !== "active") {
    return {
      ok: false,
      reason: `Blueprint가 active가 아닙니다: ${blueprint.id}`,
      confidence: "unresolved",
      matchedSignals,
    };
  }

  const pool = resolveBlueprintPool(store, blueprint.id, {
    siteId: opts?.siteId,
    vendorId: opts?.vendorId || group.vendorId,
  });
  if (!pool) {
    return {
      ok: false,
      reason: "Blueprint resolve 실패",
      confidence: "unresolved",
      matchedSignals,
    };
  }

  return {
    ok: true,
    industryId,
    blueprintId: blueprint.id,
    pool,
    reason,
    confidence,
    matchedSignals,
  };
}
