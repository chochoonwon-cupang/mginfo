/** Publish gate + failure categories (PHASE 7). No Gemini. */

export type FailureCategory = "TECHNICAL_FAILURE" | "QUALITY_FAILURE" | "VERIFIED_DATA_FAILURE";

export type PublishDecision = "PASS" | "WARN_PUBLISH" | "HOLD";

export type PublishGateResult = {
  decision: PublishDecision;
  category?: FailureCategory;
  reason?: string;
  /** Whether legacy_fallback generateArticle is allowed */
  allowLegacyFallback: boolean;
};

const TECHNICAL_CODES = new Set([
  "PLAN_SCHEMA_INVALID",
  "WRITER_SCHEMA_INVALID",
  "BLUEPRINT_LOAD_FAILED",
  "PLANNER_THROW",
  "WRITER_THROW",
]);

const VERIFIED_CODES = new Set([
  "VERIFIED_DATA_MISSING",
  "ANIMAL_TOPIC_MISMATCH",
  "ANIMAL_STATUS_LEAK",
  "SECTIONS_COLLAPSED_VERIFIED",
]);

export function categorizeFailureCodes(codes: string[]): FailureCategory {
  if (codes.some((c) => TECHNICAL_CODES.has(c))) return "TECHNICAL_FAILURE";
  if (codes.some((c) => VERIFIED_CODES.has(c))) return "VERIFIED_DATA_FAILURE";
  return "QUALITY_FAILURE";
}

/**
 * Decide publish outcome after Planner/Writer validation.
 *
 * POLICY (PHASE 7):
 * - PASS → publish
 * - WARN only → publish with log (WARN_PUBLISH)
 * - QUALITY_FAILURE → HOLD (do not publish, do not legacy_fallback)
 * - VERIFIED_DATA_FAILURE → HOLD
 * - TECHNICAL_FAILURE → allowLegacyFallback (optional path)
 */
export function decidePublishGate(input: {
  validationOk: boolean;
  hasFail: boolean;
  hasWarn: boolean;
  failureCodes?: string[];
  technicalReason?: string;
}): PublishGateResult {
  if (input.technicalReason) {
    return {
      decision: "HOLD",
      category: "TECHNICAL_FAILURE",
      reason: input.technicalReason,
      allowLegacyFallback: true,
    };
  }

  if (input.hasFail || !input.validationOk) {
    const codes = input.failureCodes || [];
    const category = categorizeFailureCodes(codes);
    if (category === "TECHNICAL_FAILURE") {
      return {
        decision: "HOLD",
        category,
        reason: codes.join(", ") || "technical failure",
        allowLegacyFallback: true,
      };
    }
    return {
      decision: "HOLD",
      category,
      reason: codes.join(", ") || "quality/verified failure",
      allowLegacyFallback: false,
    };
  }

  if (input.hasWarn) {
    return { decision: "WARN_PUBLISH", allowLegacyFallback: false };
  }

  return { decision: "PASS", allowLegacyFallback: false };
}
