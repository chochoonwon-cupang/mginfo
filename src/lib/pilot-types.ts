/**
 * PHASE 9 — daily pilot metrics (Blob/local). Does not touch Posts store.
 */
export type PilotOutcome =
  | "published_pass"
  | "published_warn"
  | "held"
  | "skipped_duplicate"
  | "skipped_industry"
  | "skipped_unresolved"
  | "technical_failure"
  | "quality_failure"
  | "verified_data_failure"
  | "legacy_fallback"
  | "error";

export type PilotEvent = {
  id: string;
  at: string;
  seoulDate: string;
  keyword: string;
  industryId?: string;
  slug?: string;
  url?: string;
  outcome: PilotOutcome;
  publishDecision?: string;
  failureCategory?: string;
  generationMode?: string;
  warningCodes?: string[];
  plannerCalls?: number;
  writerCalls?: number;
  plannerRetries?: number;
  writerRetries?: number;
  geminiCalls?: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  legacyFallback?: boolean;
  plannerFailure?: boolean;
  writerFailure?: boolean;
  geminiError?: boolean;
  jsonParseError?: boolean;
  message?: string;
  /** Public page sample fields (optional, filled by sampler). */
  publicSample?: {
    title?: string;
    h1?: string;
    metaDesc?: string;
    canonical?: string;
    hasFaq?: boolean;
    hasVerified?: boolean;
    inSitemap?: boolean;
    articleCrossLeak?: boolean;
  };
};

export type PilotDayMetrics = {
  date: string;
  attempted: number;
  published: number;
  passPublished: number;
  warnPublished: number;
  held: number;
  technicalFailure: number;
  qualityFailure: number;
  verifiedDataFailure: number;
  legacyFallback: number;
  plannerRetries: number;
  writerRetries: number;
  duplicateSkipped: number;
  industryUnresolved: number;
  industrySkipped: number;
  totalGeminiCalls: number;
  averageGeminiCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  warningCodeCounts: Record<string, number>;
};

export type PilotStore = {
  events: PilotEvent[];
  days: Record<string, PilotDayMetrics>;
  updatedAt: string;
};

export function emptyPilotDay(date: string): PilotDayMetrics {
  return {
    date,
    attempted: 0,
    published: 0,
    passPublished: 0,
    warnPublished: 0,
    held: 0,
    technicalFailure: 0,
    qualityFailure: 0,
    verifiedDataFailure: 0,
    legacyFallback: 0,
    plannerRetries: 0,
    writerRetries: 0,
    duplicateSkipped: 0,
    industryUnresolved: 0,
    industrySkipped: 0,
    totalGeminiCalls: 0,
    averageGeminiCalls: 0,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    warningCodeCounts: {},
  };
}

export function emptyPilotStore(): PilotStore {
  return { events: [], days: {}, updatedAt: new Date().toISOString() };
}
