/** Reference Data Layer — Domain Reference Truth (≠ Vendor Verified Business Truth). */

/**
 * Writer-facing statuses (PHASE 8).
 * Compat: legacy "active" → verified, "disabled" → inactive.
 */
export type ReferenceStatus = "draft" | "verified" | "inactive";

export type ReferenceSource = {
  id: string;
  title: string;
  url?: string;
  publisher?: string;
  accessedAt?: string;
  notes?: string;
};

export type ReferenceFact = {
  key: string;
  label: string;
  value: string | number | boolean | string[];
  unit?: string;
  description?: string;
  sourceIds: string[];
  verifiedAt?: string;
  updatedAt: string;
};

export type ReferenceEntity = {
  id: string;
  industryId: string;
  /** e.g. breed, process_term, material */
  entityType: string;
  key: string;
  name: string;
  aliases: string[];
  facts: ReferenceFact[];
  sources: ReferenceSource[];
  status: ReferenceStatus;
  verifiedAt?: string;
  updatedAt: string;
  createdAt: string;
};

export type ReferenceStore = {
  entities: ReferenceEntity[];
  updatedAt: string;
};

/** Compact prompt-safe facts (no full sources dump to Gemini). */
export type ReferencePromptFact = {
  entityKey: string;
  entityName: string;
  entityId: string;
  factKey: string;
  label: string;
  value: string;
  unit?: string;
};
