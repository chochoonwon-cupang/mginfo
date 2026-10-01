/**
 * PHASE 2 PagePlan — Planner output. Blueprint is a block pool; this is the page design.
 */

export type SearchIntent = {
  primary: string;
  secondary: string[];
  userGoal: string;
};

/**
 * How this page fulfills searchIntent — NOT a re-invention of user intent.
 * Diversity lives here; searchIntent may be similar across nearby-region keywords.
 */
export type ContentStrategy = {
  /** Short strategy label, e.g. "beginner-focused breed judgment" */
  summary: string;
  /** Why this strategy (recent angles, keyword sub-topics, verified data) — never region→persona. */
  rationale: string;
};

/** Generic topic breakdown — same shape for every industry. */
export type TopicContext = {
  region: string;
  primaryTopic: string;
  service: string;
  /** Only topics explicitly present in the keyword or verified facts — do not invent. */
  subTopics: string[];
};

/**
 * Optional factual regional context (PHASE 2: usually empty).
 * Never populated by Gemini invention.
 */
export type RegionalFacts = {
  region: string;
  facts: string[];
  source?: "verified" | "public_data" | "vendor" | "user_input" | "system";
};

export type PagePlanSection = {
  blockKey: string;
  heading: string;
  intent: string;
  /** Why this section exists for the reader (not just a different heading). */
  purpose: string;
  mustUseVerifiedData?: boolean;
  notesForWriter?: string;
};

export type PagePlan = {
  planId: string;
  keyword: string;
  industryId: string;
  blueprintId: string;
  blueprintVersion: number;
  pageType: string;
  contentAngle: string;
  angleReason: string;
  searchIntent: SearchIntent;
  contentStrategy: ContentStrategy;
  topicContext: TopicContext;
  /** Echo of factual regional context used (empty if none). */
  regionalFacts?: RegionalFacts;
  titleHint: string;
  metaDescriptionHint?: string;
  excludeBlockKeys?: string[];
  sections: PagePlanSection[];
  faqQuestions?: string[];
  /** Link intents only — never slug/URL. Code picks real posts later. */
  internalLinkHints?: string[];
};

export type WriterSectionResult = {
  blockKey: string;
  heading: string;
  html: string;
};

export type WriterFaqItem = {
  question: string;
  answer: string;
};

/** One Writer Gemini call returns this structured payload (not a single bodyHtml blob). */
export type WriterResult = {
  title: string;
  intro: string;
  excerpt?: string;
  sections: WriterSectionResult[];
  faqItems?: WriterFaqItem[];
  regionInfo?: string;
  nearbyAreas?: string[];
  nearbyStations?: string[];
  tags?: string[];
  slugHint?: string;
};

export type GenerationMode = "planner_writer_v1" | "legacy" | "legacy_fallback" | "held";

export type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type GenerationLog = {
  generationMode: GenerationMode;
  pipelineVersion?: string;
  plannerPromptVersion?: string;
  writerPromptVersion?: string;
  keyword: string;
  industryId?: string;
  blueprintId?: string;
  blueprintVersion?: number;
  pagePlanId?: string;
  pageType?: string;
  contentAngle?: string;
  contentStrategySummary?: string;
  plannerCalls: number;
  writerCalls: number;
  plannerRetries: number;
  writerRetries: number;
  plannerModel?: string;
  writerModel?: string;
  plannerTokens?: TokenUsage;
  writerTokens?: TokenUsage;
  removedVerifiedBlocks: Array<{ blockKey: string; reason: string }>;
  verifiedBlocksAvailable?: string[];
  verifiedBlocksRendered?: string[];
  verifiedBlocksRemoved?: Array<{ blockKey: string; reason: string }>;
  validationIssues: Array<{ code: string; severity: "info" | "warn" | "error"; message: string }>;
  qualityChecks?: Array<{ code: string; severity: "PASS" | "WARN" | "FAIL"; message: string }>;
  failureCodes?: string[];
  fallbackReason?: string;
  fallbackCode?: string;
  /** PHASE 7 publish gate */
  publishDecision?: "PASS" | "WARN_PUBLISH" | "HOLD";
  failureCategory?: "TECHNICAL_FAILURE" | "QUALITY_FAILURE" | "VERIFIED_DATA_FAILURE";
  resolverConfidence?: string;
  resolverSignals?: string[];
  verifiedContextSummary?: string;
  /** PHASE 8 — Reference entities used in Writer prompt */
  referenceEntityIds?: string[];
  errors: string[];
  startedAt: string;
  finishedAt: string;
};

/** Compact diversity context for Planner (no full bodies). */
export type RelatedPostSummary = {
  keyword?: string;
  title: string;
  pageType?: string;
  contentAngle?: string;
  h2List: string[];
};
