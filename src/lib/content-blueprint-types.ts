/** Hub-shared content architecture (PHASE 1). Planner/Writer come in later phases. */

export type CatalogStatus = "draft" | "active" | "disabled";

export type IndustryResolverHints = {
  keywords?: string[];
  aliases?: string[];
  serviceTerms?: string[];
  negativeTerms?: string[];
};

export type Industry = {
  id: string;
  key: string;
  name: string;
  description?: string;
  /** Deterministic keyword → industry signals (no Gemini). */
  resolverHints?: IndustryResolverHints;
  status: CatalogStatus;
  createdAt: string;
  updatedAt: string;
};

export type ContentBlock = {
  id: string;
  industryId: string;
  key: string;
  name: string;
  description: string;
  /** Page types that may include this block. Empty = any type for this industry. */
  allowedPageTypes: string[];
  /** Keys of verified vendor/site fields this block may need (code inserts later). */
  requiredData: string[];
  /** If true, Writer must not invent facts — only verified data or omit block. */
  verifiedDataRequired: boolean;
  optional: boolean;
  status: CatalogStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type PageType = {
  id: string;
  industryId: string;
  key: string;
  name: string;
  description: string;
  status: CatalogStatus;
  createdAt: string;
  updatedAt: string;
};

export type ContentAngle = {
  id: string;
  industryId: string;
  key: string;
  name: string;
  description: string;
  status: CatalogStatus;
  createdAt: string;
  updatedAt: string;
};

/**
 * Blueprint = pool of knowledge/blocks for an industry — NOT a fixed page outline.
 * Planner (PHASE 2) picks blocks + order per keyword.
 */
export type ContentBlueprint = {
  id: string;
  industryId: string;
  key: string;
  name: string;
  description: string;
  /** Block keys available in this pool (order here is catalog order, not page outline). */
  blockKeys: string[];
  /** Default page-type keys suggested for this blueprint (Planner may choose). */
  pageTypeKeys: string[];
  /** Angle keys available for diversity. */
  angleKeys: string[];
  status: CatalogStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * PHASE 1: typed for future SITE/VENDOR override. No admin UI yet.
 * Merge rule (later): global blueprint + override patches.
 */
export type BlueprintOverrideScope = "site" | "vendor";

export type BlueprintOverride = {
  id: string;
  scope: BlueprintOverrideScope;
  siteId?: string;
  vendorId?: string;
  baseBlueprintId: string;
  /** Add/remove from the global pool without forking the whole blueprint. */
  blockKeysAdd?: string[];
  blockKeysRemove?: string[];
  pageTypeKeysAdd?: string[];
  pageTypeKeysRemove?: string[];
  angleKeysAdd?: string[];
  angleKeysRemove?: string[];
  name?: string;
  description?: string;
  status: CatalogStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ContentBlueprintStore = {
  industries: Industry[];
  blueprints: ContentBlueprint[];
  blocks: ContentBlock[];
  pageTypes: PageType[];
  angles: ContentAngle[];
  /** Reserved for SITE/VENDOR overrides — empty in PHASE 1 seeds. */
  overrides: BlueprintOverride[];
  updatedAt: string;
};
