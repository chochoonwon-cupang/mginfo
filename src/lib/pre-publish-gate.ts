/** Pre-publish checks before Post row is created (PHASE 8 Canary). */

import { articleSlug } from "./slug";
import type { PipelineArticle } from "./content-pipeline";
import type { Post } from "./types";
import type { PublishDecision } from "./publish-gate";

export type PrePublishCheck = {
  code: string;
  ok: boolean;
  message: string;
};

export type PrePublishResult = {
  ok: boolean;
  decision: "PUBLISH" | "SKIP" | "HOLD";
  slug: string;
  checks: PrePublishCheck[];
  reason?: string;
};

function gateAllowsPublish(decision?: PublishDecision): boolean {
  return decision === "PASS" || decision === "WARN_PUBLISH";
}

/**
 * Run before writing a Post.
 * HOLD / slug collision → no Post created.
 */
export function runPrePublishGate(input: {
  article: PipelineArticle;
  keyword: string;
  existingPosts: Post[];
}): PrePublishResult {
  const { article, keyword, existingPosts } = input;
  const checks: PrePublishCheck[] = [];
  const log = article.generationLog;

  const push = (code: string, ok: boolean, message: string) => {
    checks.push({ code, ok, message });
  };

  push("INDUSTRY_RESOLVED", Boolean(article.industryId || log.industryId), `industryId=${article.industryId || log.industryId || ""}`);
  push("BLUEPRINT_RESOLVED", Boolean(article.blueprintId || log.blueprintId), `blueprintId=${article.blueprintId || log.blueprintId || ""}`);
  push("PAGEPLAN_VALID", Boolean(article.pagePlanId || log.pagePlanId), `pagePlanId=${article.pagePlanId || log.pagePlanId || ""}`);
  push(
    "WRITER_VALID",
    Boolean(article.title && article.bodyHtml) && article.generationMode !== "held",
    `mode=${article.generationMode}`
  );
  push(
    "VALIDATION_NO_FAIL",
    !(log.failureCodes || []).length && article.generationMode !== "held",
    (log.failureCodes || []).join(",") || "ok"
  );

  const decision = log.publishDecision;
  const gateOk = gateAllowsPublish(decision);
  push("PUBLISH_GATE", gateOk, `decision=${decision || "missing"}`);

  const slug = articleSlug(article.slugHint, keyword);
  push("SLUG_COMPUTED", Boolean(slug), `slug=${slug}`);

  const slugHit = existingPosts.find((p) => p.slug === slug && p.status === "published");
  push("SLUG_UNIQUE", !slugHit, slugHit ? `exists:${slugHit.id}` : "unique");

  const kwHit = existingPosts.find(
    (p) => p.status === "published" && (p.focusKeyword || "").trim() === keyword.trim()
  );
  push("FOCUS_KEYWORD_UNIQUE", !kwHit, kwHit ? `exists:${kwHit.slug}` : "unique");

  if (article.generationMode === "held" || decision === "HOLD") {
    return {
      ok: false,
      decision: "HOLD",
      slug,
      checks,
      reason: log.fallbackReason || log.errors.join("; ") || "HOLD",
    };
  }

  if (slugHit || kwHit) {
    return {
      ok: false,
      decision: "SKIP",
      slug,
      checks,
      reason: slugHit
        ? `slug already published: ${slug}`
        : `focusKeyword already published: ${keyword} → ${kwHit?.slug}`,
    };
  }

  if (!gateOk || checks.some((c) => !c.ok && c.code !== "FOCUS_KEYWORD_UNIQUE" && c.code !== "SLUG_UNIQUE")) {
    // FOCUS/SLUG already handled; other fails → HOLD
    const failed = checks.filter((c) => !c.ok).map((c) => c.code);
    if (failed.length) {
      return { ok: false, decision: "HOLD", slug, checks, reason: failed.join(", ") };
    }
  }

  // Require core resolved fields for planner path
  if (article.generationMode === "planner_writer_v1") {
    if (!article.industryId || !article.blueprintId) {
      return {
        ok: false,
        decision: "HOLD",
        slug,
        checks,
        reason: "industry/blueprint missing on planner path",
      };
    }
  }

  return { ok: true, decision: "PUBLISH", slug, checks };
}
