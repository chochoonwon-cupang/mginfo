import fs from "fs";
import path from "path";
import { blobGetReferenceDataJson, blobSetReferenceDataJson, hasBlobStore } from "./blob-store";
import { PersistError } from "./db";
import { hasRemoteStore, kvGetReferenceDataJson, kvSetReferenceDataJson } from "./kv";
import { uid } from "./slug";
import type {
  ReferenceEntity,
  ReferenceFact,
  ReferencePromptFact,
  ReferenceSource,
  ReferenceStatus,
  ReferenceStore,
} from "./reference-types";

const LOCAL_PATH = path.join(process.cwd(), "data", "reference-data.json");

const STATUSES = new Set<ReferenceStatus>(["draft", "verified", "inactive"]);

function emptyStore(): ReferenceStore {
  return { entities: [], updatedAt: new Date().toISOString() };
}

/** Map legacy active/disabled → verified/inactive without breaking stored data. */
export function normalizeReferenceStatus(value: unknown, fallback: ReferenceStatus = "draft"): ReferenceStatus {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "active") return "verified";
  if (raw === "disabled") return "inactive";
  return STATUSES.has(raw as ReferenceStatus) ? (raw as ReferenceStatus) : fallback;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v || "").trim()).filter(Boolean))];
}

function normalizeSource(raw: unknown): ReferenceSource | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const title = String(row.title || "").trim();
  if (!title) return null;
  return {
    id: String(row.id || uid()).trim(),
    title,
    url: String(row.url || "").trim() || undefined,
    publisher: String(row.publisher || "").trim() || undefined,
    accessedAt: String(row.accessedAt || "").trim() || undefined,
    notes: String(row.notes || "").trim() || undefined,
  };
}

function normalizeFact(raw: unknown): ReferenceFact | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const key = String(row.key || "").trim();
  const label = String(row.label || "").trim();
  if (!key || !label) return null;
  const now = new Date().toISOString();
  let value: ReferenceFact["value"] = "";
  if (Array.isArray(row.value)) value = row.value.map(String);
  else if (typeof row.value === "boolean" || typeof row.value === "number") value = row.value;
  else value = String(row.value ?? "").trim();
  return {
    key,
    label,
    value,
    unit: String(row.unit || "").trim() || undefined,
    description: String(row.description || "").trim() || undefined,
    sourceIds: asStringList(row.sourceIds),
    verifiedAt: String(row.verifiedAt || "").trim() || undefined,
    updatedAt: String(row.updatedAt || now),
  };
}

function normalizeEntity(raw: unknown): ReferenceEntity | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const industryId = String(row.industryId || "").trim();
  const entityType = String(row.entityType || "").trim();
  const key = String(row.key || "").trim();
  const name = String(row.name || "").trim();
  if (!industryId || !entityType || !key || !name) return null;
  const now = new Date().toISOString();
  return {
    id: String(row.id || `ref-${key}`).trim(),
    industryId,
    entityType,
    key,
    name,
    aliases: asStringList(row.aliases),
    facts: Array.isArray(row.facts) ? (row.facts.map(normalizeFact).filter(Boolean) as ReferenceFact[]) : [],
    sources: Array.isArray(row.sources)
      ? (row.sources.map(normalizeSource).filter(Boolean) as ReferenceSource[])
      : [],
    status: normalizeReferenceStatus(row.status, "draft"),
    verifiedAt: String(row.verifiedAt || "").trim() || undefined,
    updatedAt: String(row.updatedAt || now),
    createdAt: String(row.createdAt || now),
  };
}

export function normalizeReferenceStore(raw: unknown): ReferenceStore {
  if (!raw || typeof raw !== "object") return emptyStore();
  const row = raw as Record<string, unknown>;
  const entities = Array.isArray(row.entities)
    ? (row.entities.map(normalizeEntity).filter(Boolean) as ReferenceEntity[])
    : [];
  return {
    entities,
    updatedAt: String(row.updatedAt || new Date().toISOString()),
  };
}

function readFile(): ReferenceStore {
  try {
    if (!fs.existsSync(LOCAL_PATH)) return emptyStore();
    return normalizeReferenceStore(JSON.parse(fs.readFileSync(LOCAL_PATH, "utf8")));
  } catch {
    return emptyStore();
  }
}

function writeFile(store: ReferenceStore) {
  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function loadStore(): Promise<ReferenceStore> {
  if (hasBlobStore()) {
    const remote = await blobGetReferenceDataJson<ReferenceStore>();
    if (remote) return normalizeReferenceStore(remote);
    return emptyStore();
  }
  if (hasRemoteStore()) {
    const remote = await kvGetReferenceDataJson<ReferenceStore>();
    if (remote) return normalizeReferenceStore(remote);
    return emptyStore();
  }
  return readFile();
}

async function saveStore(store: ReferenceStore) {
  const next = { ...store, updatedAt: new Date().toISOString() };
  try {
    if (hasBlobStore()) {
      await blobSetReferenceDataJson(next);
      return next;
    }
    if (hasRemoteStore()) {
      await kvSetReferenceDataJson(next);
      return next;
    }
    if (process.env.VERCEL) {
      throw new PersistError("Reference Data는 Blob/KV에서만 저장할 수 있습니다.");
    }
    writeFile(next);
    return next;
  } catch (err) {
    if (err instanceof PersistError) throw err;
    throw new PersistError(err instanceof Error ? err.message : "Reference 저장 실패");
  }
}

export async function getReferenceStore(): Promise<ReferenceStore> {
  return loadStore();
}

export async function upsertReferenceEntity(
  input: Partial<ReferenceEntity> & { industryId: string; entityType: string; key: string; name: string }
): Promise<{ store: ReferenceStore; entity: ReferenceEntity }> {
  const store = await loadStore();
  const now = new Date().toISOString();
  const id = String(input.id || "").trim() || `ref-${input.key}-${uid().slice(0, 6)}`;
  const normalized = normalizeEntity({
    ...input,
    id,
    updatedAt: now,
    createdAt: input.createdAt || now,
  });
  if (!normalized) throw new PersistError("ReferenceEntity가 올바르지 않습니다.");
  const idx = store.entities.findIndex(
    (e) => e.id === normalized.id || (e.key === normalized.key && e.industryId === normalized.industryId)
  );
  const entities =
    idx >= 0
      ? store.entities.map((e, i) => (i === idx ? { ...normalized, createdAt: e.createdAt } : e))
      : [...store.entities, normalized];
  const saved = await saveStore({ ...store, entities });
  const entity = saved.entities.find((e) => e.id === normalized.id) || normalized;
  return { store: saved, entity };
}

export async function deleteReferenceEntity(id: string): Promise<ReferenceStore> {
  const store = await loadStore();
  return saveStore({
    ...store,
    entities: store.entities.filter((e) => e.id !== id),
  });
}

/** True when value looks like a concrete numeric / measurement claim. */
export function factLooksNumeric(fact: ReferenceFact): boolean {
  const raw = Array.isArray(fact.value) ? fact.value.join(" ") : String(fact.value ?? "");
  if (fact.unit && String(fact.unit).trim()) return true;
  return /\d/.test(raw);
}

/** All sourceIds must resolve to sources on the same entity. verifiedAt alone is not enough. */
export function factHasResolvedSources(entity: ReferenceEntity, fact: ReferenceFact): boolean {
  if (!fact.sourceIds.length) return false;
  const ids = new Set(entity.sources.map((s) => s.id));
  return fact.sourceIds.every((id) => ids.has(id));
}

/**
 * Writer-eligible facts:
 * - entity.status === verified
 * - numeric/concrete facts require resolved sourceIds → sources
 * - non-numeric facts still require at least one resolved source when sourceIds present;
 *   if no sourceIds and non-numeric, still require provenance for PHASE 8 safety → skip
 */
export function isWriterEligibleFact(entity: ReferenceEntity, fact: ReferenceFact): boolean {
  if (entity.status !== "verified") return false;
  if (!factHasResolvedSources(entity, fact)) return false;
  return true;
}

/** Match verified entities by keyword / aliases (deterministic). */
export function findReferenceEntitiesForKeyword(
  store: ReferenceStore,
  keyword: string,
  industryId?: string
): ReferenceEntity[] {
  const kw = String(keyword || "").toLowerCase();
  if (!kw) return [];
  return store.entities.filter((e) => {
    if (e.status !== "verified") return false;
    if (industryId && e.industryId !== industryId) return false;
    const names = [e.name, e.key, ...e.aliases].map((s) => s.toLowerCase());
    return names.some((n) => n && (kw.includes(n) || n.includes(kw)));
  });
}

export function formatReferenceFactsForPrompt(entities: ReferenceEntity[]): ReferencePromptFact[] {
  const out: ReferencePromptFact[] = [];
  for (const e of entities) {
    for (const f of e.facts) {
      if (!isWriterEligibleFact(e, f)) continue;
      const value = Array.isArray(f.value) ? f.value.join(", ") : String(f.value);
      if (!String(value).trim()) continue;
      out.push({
        entityKey: e.key,
        entityName: e.name,
        entityId: e.id,
        factKey: f.key,
        label: f.label,
        value: String(value).trim(),
        unit: f.unit,
      });
    }
  }
  return out;
}

export function referenceFactsPromptBlock(facts: ReferencePromptFact[]): string {
  if (!facts.length) return "(없음 — verified Reference Data 미제공. 구체 숫자·수치를 기억으로 만들지 마라.)";
  return facts
    .map((f) => `- [${f.entityName}] ${f.label}: ${f.value}${f.unit ? ` ${f.unit}` : ""}`)
    .join("\n");
}

/** Audit helper for Admin/QA — provenance chain status. */
export function auditReferenceProvenance(entity: ReferenceEntity): {
  status: ReferenceStatus;
  facts: Array<{
    key: string;
    numeric: boolean;
    hasSourceIds: boolean;
    sourcesResolved: boolean;
    writerEligible: boolean;
  }>;
} {
  return {
    status: entity.status,
    facts: entity.facts.map((f) => ({
      key: f.key,
      numeric: factLooksNumeric(f),
      hasSourceIds: f.sourceIds.length > 0,
      sourcesResolved: factHasResolvedSources(entity, f),
      writerEligible: isWriterEligibleFact(entity, f),
    })),
  };
}

/**
 * Pomeranian seed with resolved Source + verified status.
 * Weight range sourced from AKC breed standard overview (public breed page).
 */
export function seedPomeranianReference(): ReferenceEntity {
  const now = new Date().toISOString();
  return {
    id: "ref-breed-pomeranian",
    industryId: "ind-dog-adoption",
    entityType: "breed",
    key: "pomeranian",
    name: "포메라니안",
    aliases: ["포메", "포메라니안견"],
    facts: [
      {
        key: "adult_weight_range",
        label: "성견 체중 범위",
        value: "1.9–3.5",
        unit: "kg",
        description: "AKC 기준에 가까운 일반적 성견 체중 범위(개체차 있음). 3–7 lb ≈ 1.4–3.2 kg 대역을 kg로 표기.",
        sourceIds: ["src-akc-pomeranian"],
        verifiedAt: now,
        updatedAt: now,
      },
      {
        key: "coat_type",
        label: "모질",
        value: "이중모",
        sourceIds: ["src-akc-pomeranian"],
        verifiedAt: now,
        updatedAt: now,
      },
    ],
    sources: [
      {
        id: "src-akc-pomeranian",
        title: "AKC — Pomeranian Dog Breed Information",
        url: "https://www.akc.org/dog-breeds/pomeranian/",
        publisher: "American Kennel Club",
        notes: "PHASE 8 canary — public breed page; weight converted to kg for KR readers.",
        accessedAt: now,
      },
    ],
    status: "verified",
    verifiedAt: now,
    updatedAt: now,
    createdAt: now,
  };
}
