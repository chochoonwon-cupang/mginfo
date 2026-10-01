import fs from "fs";
import path from "path";
import { blobGetContentBlueprintsJson, blobSetContentBlueprintsJson, hasBlobStore } from "./blob-store";
import { seedContentBlueprintStore } from "./content-blueprint-seed";
import type {
  CatalogStatus,
  ContentAngle,
  ContentBlock,
  ContentBlueprint,
  ContentBlueprintStore,
  BlueprintOverride,
  Industry,
  PageType,
} from "./content-blueprint-types";
import { PersistError } from "./db";
import { hasRemoteStore, kvGetContentBlueprintsJson, kvSetContentBlueprintsJson } from "./kv";

const LOCAL_PATH = path.join(process.cwd(), "data", "content-blueprints.json");

const STATUSES = new Set<CatalogStatus>(["draft", "active", "disabled"]);

function asStatus(value: unknown, fallback: CatalogStatus = "draft"): CatalogStatus {
  const raw = String(value || "").trim().toLowerCase();
  return STATUSES.has(raw as CatalogStatus) ? (raw as CatalogStatus) : fallback;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
}

function normalizeIndustry(raw: unknown): Industry | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id || "").trim();
  const key = String(row.key || "").trim();
  const name = String(row.name || "").trim();
  if (!id || !key || !name) return null;
  const now = new Date().toISOString();
  return {
    id,
    key,
    name,
    description: String(row.description || "").trim() || undefined,
    resolverHints: normalizeResolverHints(row.resolverHints),
    status: asStatus(row.status, "active"),
    createdAt: String(row.createdAt || now),
    updatedAt: String(row.updatedAt || now),
  };
}

function normalizeResolverHints(raw: unknown): Industry["resolverHints"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  const hints = {
    keywords: asStringList(row.keywords),
    aliases: asStringList(row.aliases),
    serviceTerms: asStringList(row.serviceTerms),
    negativeTerms: asStringList(row.negativeTerms),
  };
  if (!hints.keywords.length && !hints.aliases.length && !hints.serviceTerms.length && !hints.negativeTerms.length) {
    return undefined;
  }
  return hints;
}

function normalizeBlock(raw: unknown): ContentBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id || "").trim();
  const industryId = String(row.industryId || "").trim();
  const key = String(row.key || "").trim();
  const name = String(row.name || "").trim();
  if (!id || !industryId || !key || !name) return null;
  const now = new Date().toISOString();
  return {
    id,
    industryId,
    key,
    name,
    description: String(row.description || "").trim(),
    allowedPageTypes: asStringList(row.allowedPageTypes),
    requiredData: asStringList(row.requiredData),
    verifiedDataRequired: Boolean(row.verifiedDataRequired),
    optional: row.optional === undefined ? true : Boolean(row.optional),
    status: asStatus(row.status, "active"),
    version: Math.max(1, Number(row.version) || 1),
    createdAt: String(row.createdAt || now),
    updatedAt: String(row.updatedAt || now),
  };
}

function normalizePageType(raw: unknown): PageType | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id || "").trim();
  const industryId = String(row.industryId || "").trim();
  const key = String(row.key || "").trim();
  const name = String(row.name || "").trim();
  if (!id || !industryId || !key || !name) return null;
  const now = new Date().toISOString();
  return {
    id,
    industryId,
    key,
    name,
    description: String(row.description || "").trim(),
    status: asStatus(row.status, "active"),
    createdAt: String(row.createdAt || now),
    updatedAt: String(row.updatedAt || now),
  };
}

function normalizeAngle(raw: unknown): ContentAngle | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id || "").trim();
  const industryId = String(row.industryId || "").trim();
  const key = String(row.key || "").trim();
  const name = String(row.name || "").trim();
  if (!id || !industryId || !key || !name) return null;
  const now = new Date().toISOString();
  return {
    id,
    industryId,
    key,
    name,
    description: String(row.description || "").trim(),
    status: asStatus(row.status, "active"),
    createdAt: String(row.createdAt || now),
    updatedAt: String(row.updatedAt || now),
  };
}

function normalizeBlueprint(raw: unknown): ContentBlueprint | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id || "").trim();
  const industryId = String(row.industryId || "").trim();
  const key = String(row.key || "").trim();
  const name = String(row.name || "").trim();
  if (!id || !industryId || !key || !name) return null;
  const now = new Date().toISOString();
  return {
    id,
    industryId,
    key,
    name,
    description: String(row.description || "").trim(),
    blockKeys: asStringList(row.blockKeys),
    pageTypeKeys: asStringList(row.pageTypeKeys),
    angleKeys: asStringList(row.angleKeys),
    status: asStatus(row.status, "active"),
    version: Math.max(1, Number(row.version) || 1),
    createdAt: String(row.createdAt || now),
    updatedAt: String(row.updatedAt || now),
  };
}

function normalizeOverride(raw: unknown): BlueprintOverride | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id || "").trim();
  const baseBlueprintId = String(row.baseBlueprintId || "").trim();
  const scope = String(row.scope || "").trim() === "vendor" ? "vendor" : "site";
  if (!id || !baseBlueprintId) return null;
  const now = new Date().toISOString();
  return {
    id,
    scope,
    siteId: String(row.siteId || "").trim() || undefined,
    vendorId: String(row.vendorId || "").trim() || undefined,
    baseBlueprintId,
    blockKeysAdd: asStringList(row.blockKeysAdd),
    blockKeysRemove: asStringList(row.blockKeysRemove),
    pageTypeKeysAdd: asStringList(row.pageTypeKeysAdd),
    pageTypeKeysRemove: asStringList(row.pageTypeKeysRemove),
    angleKeysAdd: asStringList(row.angleKeysAdd),
    angleKeysRemove: asStringList(row.angleKeysRemove),
    name: String(row.name || "").trim() || undefined,
    description: String(row.description || "").trim() || undefined,
    status: asStatus(row.status, "draft"),
    version: Math.max(1, Number(row.version) || 1),
    createdAt: String(row.createdAt || now),
    updatedAt: String(row.updatedAt || now),
  };
}

export function normalizeContentBlueprintStore(raw: unknown): ContentBlueprintStore {
  if (!raw || typeof raw !== "object") return seedContentBlueprintStore();
  const row = raw as Record<string, unknown>;
  const industries = Array.isArray(row.industries) ? row.industries.map(normalizeIndustry).filter(Boolean) : [];
  const blueprints = Array.isArray(row.blueprints) ? row.blueprints.map(normalizeBlueprint).filter(Boolean) : [];
  const blocks = Array.isArray(row.blocks) ? row.blocks.map(normalizeBlock).filter(Boolean) : [];
  const pageTypes = Array.isArray(row.pageTypes) ? row.pageTypes.map(normalizePageType).filter(Boolean) : [];
  const angles = Array.isArray(row.angles) ? row.angles.map(normalizeAngle).filter(Boolean) : [];
  const overrides = Array.isArray(row.overrides) ? row.overrides.map(normalizeOverride).filter(Boolean) : [];
  if (!industries.length || !blueprints.length) {
    const seeded = seedContentBlueprintStore();
    return {
      ...seeded,
      overrides: overrides as BlueprintOverride[],
      updatedAt: new Date().toISOString(),
    };
  }
  // PHASE 7: patch resolverHints from seed when remote store lacks them (no full reseed).
  const seedHints = new Map(
    seedContentBlueprintStore().industries.map((i) => [i.id, i.resolverHints] as const)
  );
  const patchedIndustries = (industries as Industry[]).map((ind) => {
    if (ind.resolverHints) return ind;
    const hints = seedHints.get(ind.id);
    return hints ? { ...ind, resolverHints: hints } : ind;
  });
  return {
    industries: patchedIndustries,
    blueprints: blueprints as ContentBlueprint[],
    blocks: blocks as ContentBlock[],
    pageTypes: pageTypes as PageType[],
    angles: angles as ContentAngle[],
    overrides: overrides as BlueprintOverride[],
    updatedAt: String(row.updatedAt || new Date().toISOString()),
  };
}

function readFile(): ContentBlueprintStore {
  try {
    if (!fs.existsSync(LOCAL_PATH)) return seedContentBlueprintStore();
    return normalizeContentBlueprintStore(JSON.parse(fs.readFileSync(LOCAL_PATH, "utf8")));
  } catch {
    return seedContentBlueprintStore();
  }
}

function writeFile(store: ContentBlueprintStore) {
  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function loadStore(): Promise<ContentBlueprintStore> {
  if (hasBlobStore()) {
    const remote = await blobGetContentBlueprintsJson<ContentBlueprintStore>();
    if (remote) return normalizeContentBlueprintStore(remote);
    const seeded = seedContentBlueprintStore();
    try {
      await blobSetContentBlueprintsJson(seeded);
    } catch {
      /* first write may fail in build */
    }
    return seeded;
  }
  if (hasRemoteStore()) {
    const remote = await kvGetContentBlueprintsJson<ContentBlueprintStore>();
    if (remote) return normalizeContentBlueprintStore(remote);
    const seeded = seedContentBlueprintStore();
    try {
      await kvSetContentBlueprintsJson(seeded);
    } catch {
      /* ignore */
    }
    return seeded;
  }
  return readFile();
}

async function saveStore(store: ContentBlueprintStore) {
  const next = { ...store, updatedAt: new Date().toISOString() };
  try {
    if (hasBlobStore()) {
      await blobSetContentBlueprintsJson(next);
      return next;
    }
    if (hasRemoteStore()) {
      await kvSetContentBlueprintsJson(next);
      return next;
    }
    if (process.env.VERCEL) {
      throw new PersistError("콘텐츠 Blueprint는 허브 Blob에서만 저장할 수 있습니다.");
    }
    writeFile(next);
    return next;
  } catch (err) {
    if (err instanceof PersistError) throw err;
    throw new PersistError(err instanceof Error ? err.message : "Blueprint를 저장하지 못했습니다.");
  }
}

export async function getContentBlueprintStore(): Promise<ContentBlueprintStore> {
  return loadStore();
}

export async function setBlueprintStatus(blueprintId: string, status: CatalogStatus) {
  const store = await loadStore();
  const idx = store.blueprints.findIndex((row) => row.id === blueprintId);
  if (idx < 0) return { ok: false as const, error: "Blueprint를 찾을 수 없습니다." };
  const next = {
    ...store,
    blueprints: store.blueprints.map((row, i) =>
      i === idx
        ? {
            ...row,
            status,
            version: status === "active" && row.status !== "active" ? row.version : row.version,
            updatedAt: new Date().toISOString(),
          }
        : row
    ),
  };
  const saved = await saveStore(next);
  return { ok: true as const, store: saved, blueprint: saved.blueprints[idx] };
}

export async function setBlockStatus(blockId: string, status: CatalogStatus) {
  const store = await loadStore();
  const idx = store.blocks.findIndex((row) => row.id === blockId);
  if (idx < 0) return { ok: false as const, error: "블록을 찾을 수 없습니다." };
  const next = {
    ...store,
    blocks: store.blocks.map((row, i) =>
      i === idx ? { ...row, status, updatedAt: new Date().toISOString() } : row
    ),
  };
  const saved = await saveStore(next);
  return { ok: true as const, store: saved, block: saved.blocks[idx] };
}

function slugKey(raw: string, fallback = "block"): string {
  const cleaned = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return cleaned || fallback;
}

/** Create or update a content block for an industry. */
export async function upsertBlock(input: {
  id?: string;
  industryId: string;
  key: string;
  name: string;
  description?: string;
  verifiedDataRequired?: boolean;
  optional?: boolean;
  status?: CatalogStatus;
  allowedPageTypes?: string[];
  /** If set, ensure this blueprint includes the block key. */
  addToBlueprintId?: string;
}) {
  const store = await loadStore();
  const industryId = String(input.industryId || "").trim();
  if (!store.industries.some((row) => row.id === industryId)) {
    return { ok: false as const, error: "업종을 찾을 수 없습니다." };
  }
  const key = slugKey(input.key || input.name, "block");
  const name = String(input.name || "").trim();
  if (!name) return { ok: false as const, error: "블록 이름이 필요합니다." };
  const now = new Date().toISOString();
  const id = String(input.id || "").trim() || `blk-${industryId.replace(/^ind-/, "")}-${key}`;
  const existing = store.blocks.findIndex(
    (row) => row.id === id || (row.industryId === industryId && row.key === key)
  );

  let nextBlocks = store.blocks;
  let block: ContentBlock;
  if (existing >= 0) {
    block = {
      ...store.blocks[existing],
      key,
      name,
      description: String(input.description || "").trim(),
      verifiedDataRequired:
        input.verifiedDataRequired !== undefined
          ? Boolean(input.verifiedDataRequired)
          : store.blocks[existing].verifiedDataRequired,
      optional: input.optional !== undefined ? Boolean(input.optional) : store.blocks[existing].optional,
      status: input.status || store.blocks[existing].status,
      allowedPageTypes: input.allowedPageTypes || store.blocks[existing].allowedPageTypes,
      updatedAt: now,
    };
    nextBlocks = store.blocks.map((row, i) => (i === existing ? block : row));
  } else {
    block = {
      id,
      industryId,
      key,
      name,
      description: String(input.description || "").trim(),
      allowedPageTypes: input.allowedPageTypes?.length ? input.allowedPageTypes : ["local_service"],
      requiredData: [],
      verifiedDataRequired: Boolean(input.verifiedDataRequired),
      optional: input.optional !== false,
      status: input.status || "draft",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    nextBlocks = [...store.blocks, block];
  }

  let nextBlueprints = store.blueprints;
  const bpId = String(input.addToBlueprintId || "").trim();
  if (bpId) {
    const bpIdx = nextBlueprints.findIndex((row) => row.id === bpId && row.industryId === industryId);
    if (bpIdx < 0) return { ok: false as const, error: "Blueprint를 찾을 수 없습니다." };
    const bp = nextBlueprints[bpIdx];
    if (!bp.blockKeys.includes(key)) {
      nextBlueprints = nextBlueprints.map((row, i) =>
        i === bpIdx
          ? { ...row, blockKeys: [...row.blockKeys, key], updatedAt: now }
          : row
      );
    }
  }

  const saved = await saveStore({ ...store, blocks: nextBlocks, blueprints: nextBlueprints });
  return {
    ok: true as const,
    store: saved,
    block: saved.blocks.find((row) => row.id === block.id) || block,
    created: existing < 0,
  };
}

/** Replace blueprint blockKeys (add/remove membership). */
export async function setBlueprintBlockKeys(blueprintId: string, blockKeys: string[]) {
  const store = await loadStore();
  const idx = store.blueprints.findIndex((row) => row.id === blueprintId);
  if (idx < 0) return { ok: false as const, error: "Blueprint를 찾을 수 없습니다." };
  const bp = store.blueprints[idx];
  const industryBlocks = new Set(
    store.blocks.filter((row) => row.industryId === bp.industryId).map((row) => row.key)
  );
  const cleaned = [...new Set(blockKeys.map((k) => String(k || "").trim()).filter(Boolean))].filter((k) =>
    industryBlocks.has(k)
  );
  const next = {
    ...store,
    blueprints: store.blueprints.map((row, i) =>
      i === idx
        ? {
            ...row,
            blockKeys: cleaned,
            updatedAt: new Date().toISOString(),
          }
        : row
    ),
  };
  const saved = await saveStore(next);
  return { ok: true as const, store: saved, blueprint: saved.blueprints[idx] };
}

/** Insert many draft blocks (and optional angles/pageTypes) for an industry. */
export async function applyIndustryDraftPack(input: {
  industryId: string;
  blueprintId?: string;
  blocks: Array<{
    key: string;
    name: string;
    description?: string;
    verifiedDataRequired?: boolean;
  }>;
  angles?: Array<{ key: string; name: string; description?: string }>;
  pageTypes?: Array<{ key: string; name: string; description?: string }>;
}) {
  const store = await loadStore();
  const industryId = String(input.industryId || "").trim();
  const industry = store.industries.find((row) => row.id === industryId);
  if (!industry) return { ok: false as const, error: "업종을 찾을 수 없습니다." };
  const now = new Date().toISOString();
  const short = industry.key.replace(/^ind-/, "") || industry.key;

  const existingBlockKeys = new Set(
    store.blocks.filter((row) => row.industryId === industryId).map((row) => row.key)
  );
  const newBlocks: ContentBlock[] = [];
  for (const row of input.blocks || []) {
    const key = slugKey(row.key || row.name);
    if (!key || existingBlockKeys.has(key)) continue;
    existingBlockKeys.add(key);
    newBlocks.push({
      id: `blk-${short}-${key}-${Date.now().toString(36).slice(-4)}`,
      industryId,
      key,
      name: String(row.name || key).trim(),
      description: String(row.description || "").trim(),
      allowedPageTypes: ["local_service"],
      requiredData: [],
      verifiedDataRequired: Boolean(row.verifiedDataRequired),
      optional: true,
      status: "draft",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  const existingAngles = new Set(
    store.angles.filter((row) => row.industryId === industryId).map((row) => row.key)
  );
  const newAngles: ContentAngle[] = [];
  for (const row of input.angles || []) {
    const key = slugKey(row.key || row.name, "angle");
    if (!key || existingAngles.has(key)) continue;
    existingAngles.add(key);
    newAngles.push({
      id: `ang-${short}-${key}`,
      industryId,
      key,
      name: String(row.name || key).trim(),
      description: String(row.description || "").trim(),
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
  }

  const existingPts = new Set(
    store.pageTypes.filter((row) => row.industryId === industryId).map((row) => row.key)
  );
  const newPageTypes: PageType[] = [];
  for (const row of input.pageTypes || []) {
    const key = slugKey(row.key || row.name, "page");
    if (!key || existingPts.has(key)) continue;
    existingPts.add(key);
    newPageTypes.push({
      id: `pt-${short}-${key}`,
      industryId,
      key,
      name: String(row.name || key).trim(),
      description: String(row.description || "").trim(),
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
  }

  if (!newBlocks.length && !newAngles.length && !newPageTypes.length) {
    return { ok: false as const, error: "추가할 새 항목이 없습니다. (키가 이미 있을 수 있습니다)" };
  }

  let nextBlueprints = store.blueprints;
  const bpId =
    String(input.blueprintId || "").trim() ||
    store.blueprints.find((row) => row.industryId === industryId)?.id ||
    "";
  if (bpId && newBlocks.length) {
    const bpIdx = nextBlueprints.findIndex((row) => row.id === bpId);
    if (bpIdx >= 0) {
      const bp = nextBlueprints[bpIdx];
      const mergedKeys = [...bp.blockKeys];
      for (const b of newBlocks) {
        if (!mergedKeys.includes(b.key)) mergedKeys.push(b.key);
      }
      const mergedAngles = [...bp.angleKeys];
      for (const a of newAngles) {
        if (!mergedAngles.includes(a.key)) mergedAngles.push(a.key);
      }
      const mergedPts = [...bp.pageTypeKeys];
      for (const p of newPageTypes) {
        if (!mergedPts.includes(p.key)) mergedPts.push(p.key);
      }
      nextBlueprints = nextBlueprints.map((row, i) =>
        i === bpIdx
          ? {
              ...row,
              blockKeys: mergedKeys,
              angleKeys: mergedAngles,
              pageTypeKeys: mergedPts,
              updatedAt: now,
            }
          : row
      );
    }
  }

  const saved = await saveStore({
    ...store,
    blocks: [...store.blocks, ...newBlocks],
    angles: [...store.angles, ...newAngles],
    pageTypes: [...store.pageTypes, ...newPageTypes],
    blueprints: nextBlueprints,
  });
  return {
    ok: true as const,
    store: saved,
    added: {
      blocks: newBlocks.length,
      angles: newAngles.length,
      pageTypes: newPageTypes.length,
    },
  };
}

export async function setIndustryStatus(industryId: string, status: CatalogStatus) {
  const store = await loadStore();
  const idx = store.industries.findIndex((row) => row.id === industryId);
  if (idx < 0) return { ok: false as const, error: "업종을 찾을 수 없습니다." };
  const next = {
    ...store,
    industries: store.industries.map((row, i) =>
      i === idx ? { ...row, status, updatedAt: new Date().toISOString() } : row
    ),
  };
  const saved = await saveStore(next);
  return { ok: true as const, store: saved, industry: saved.industries[idx] };
}

export async function updateIndustryHints(
  industryId: string,
  hints: {
    keywords?: string[];
    aliases?: string[];
    serviceTerms?: string[];
    negativeTerms?: string[];
    name?: string;
    description?: string;
  }
) {
  const store = await loadStore();
  const idx = store.industries.findIndex((row) => row.id === industryId);
  if (idx < 0) return { ok: false as const, error: "업종을 찾을 수 없습니다." };
  const current = store.industries[idx];
  const mergedHints = normalizeResolverHints({
    keywords: hints.keywords ?? current.resolverHints?.keywords ?? [],
    aliases: hints.aliases ?? current.resolverHints?.aliases ?? [],
    serviceTerms: hints.serviceTerms ?? current.resolverHints?.serviceTerms ?? [],
    negativeTerms: hints.negativeTerms ?? current.resolverHints?.negativeTerms ?? [],
  });
  const next = {
    ...store,
    industries: store.industries.map((row, i) =>
      i === idx
        ? {
            ...row,
            name: hints.name !== undefined ? String(hints.name || "").trim() || row.name : row.name,
            description:
              hints.description !== undefined
                ? String(hints.description || "").trim() || undefined
                : row.description,
            resolverHints: mergedHints,
            updatedAt: new Date().toISOString(),
          }
        : row
    ),
  };
  const saved = await saveStore(next);
  return { ok: true as const, store: saved, industry: saved.industries[idx] };
}

/** Create or update an industry. On create, attaches a minimal draft Blueprint pack. */
export async function upsertIndustry(input: {
  id?: string;
  key: string;
  name: string;
  description?: string;
  status?: CatalogStatus;
  resolverHints?: {
    keywords?: string[];
    aliases?: string[];
    serviceTerms?: string[];
    negativeTerms?: string[];
  };
  /** When creating, also add draft blueprint + basic AI blocks (default true). */
  withStarterPack?: boolean;
}) {
  const store = await loadStore();
  const key = String(input.key || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const name = String(input.name || "").trim();
  if (!key || !name) return { ok: false as const, error: "업종 키(영문)와 이름이 필요합니다." };
  const now = new Date().toISOString();
  const id = String(input.id || "").trim() || `ind-${key}`;
  const existing = store.industries.findIndex((row) => row.id === id || row.key === key);
  const hints = normalizeResolverHints(input.resolverHints || {});
  if (existing >= 0) {
    const next = {
      ...store,
      industries: store.industries.map((row, i) =>
        i === existing
          ? {
              ...row,
              key,
              name,
              description: String(input.description || "").trim() || undefined,
              status: input.status || row.status,
              resolverHints: hints ?? row.resolverHints,
              updatedAt: now,
            }
          : row
      ),
    };
    const saved = await saveStore(next);
    return { ok: true as const, store: saved, industry: saved.industries[existing], created: false };
  }
  const industry: Industry = {
    id,
    key,
    name,
    description: String(input.description || "").trim() || undefined,
    resolverHints: hints,
    status: input.status || "draft",
    createdAt: now,
    updatedAt: now,
  };

  let nextStore: ContentBlueprintStore = {
    ...store,
    industries: [...store.industries, industry],
  };

  const withPack = input.withStarterPack !== false;
  if (withPack) {
    const short = key.replace(/^ind-/, "") || key;
    const pageType: PageType = {
      id: `pt-${short}-local`,
      industryId: id,
      key: "local_service",
      name: "지역 서비스",
      description: `${name} 지역·키워드 안내 글`,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    const angles: ContentAngle[] = [
      {
        id: `ang-${short}-general`,
        industryId: id,
        key: "general",
        name: "일반 안내",
        description: "기본 안내 앵글",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `ang-${short}-beginner`,
        industryId: id,
        key: "beginner",
        name: "초보 안내",
        description: "처음 알아보는 독자",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ];
    const blocks: ContentBlock[] = [
      {
        id: `blk-${short}-overview`,
        industryId: id,
        key: "overview",
        name: "개요",
        description: "주제를 한눈에 보는 도입·범위",
        allowedPageTypes: ["local_service"],
        requiredData: [],
        verifiedDataRequired: false,
        optional: false,
        status: "active",
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `blk-${short}-checklist`,
        industryId: id,
        key: "checklist",
        name: "확인 체크리스트",
        description: "선택·의뢰 전 확인할 항목",
        allowedPageTypes: ["local_service"],
        requiredData: [],
        verifiedDataRequired: false,
        optional: true,
        status: "active",
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `blk-${short}-tips`,
        industryId: id,
        key: "tips",
        name: "실무 팁",
        description: "현장에서 자주 묻는 요령",
        allowedPageTypes: ["local_service"],
        requiredData: [],
        verifiedDataRequired: false,
        optional: true,
        status: "active",
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `blk-${short}-faq`,
        industryId: id,
        key: "faq",
        name: "FAQ",
        description: "자주 묻는 질문 (faqItems로 렌더)",
        allowedPageTypes: ["local_service"],
        requiredData: [],
        verifiedDataRequired: false,
        optional: true,
        status: "active",
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const blueprint: ContentBlueprint = {
      id: `bp-${short}-v1`,
      industryId: id,
      key: `${short}_v1`,
      name: `${name} 기본 재료`,
      description: "관리자에서 만든 기본 Blueprint. 블록을 보강한 뒤 「사용 중」으로 바꾸세요.",
      blockKeys: blocks.map((b) => b.key),
      pageTypeKeys: [pageType.key],
      angleKeys: angles.map((a) => a.key),
      status: "draft",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    nextStore = {
      ...nextStore,
      pageTypes: [...nextStore.pageTypes, pageType],
      angles: [...nextStore.angles, ...angles],
      blocks: [...nextStore.blocks, ...blocks],
      blueprints: [...nextStore.blueprints, blueprint],
    };
  }

  const saved = await saveStore(nextStore);
  return { ok: true as const, store: saved, industry, created: true };
}

export async function resetContentBlueprintsToSeed() {
  const seeded = seedContentBlueprintStore();
  const saved = await saveStore(seeded);
  return saved;
}

/** Resolve global blueprint + optional override without mutating store (PHASE 2+). */
export function resolveBlueprintPool(
  store: ContentBlueprintStore,
  blueprintId: string,
  opts?: { siteId?: string; vendorId?: string }
) {
  const base = store.blueprints.find((row) => row.id === blueprintId);
  if (!base) return null;
  const override =
    store.overrides.find(
      (row) =>
        row.status === "active" &&
        row.baseBlueprintId === blueprintId &&
        ((opts?.vendorId && row.scope === "vendor" && row.vendorId === opts.vendorId) ||
          (opts?.siteId && row.scope === "site" && row.siteId === opts.siteId))
    ) || null;

  const blockKeys = new Set(base.blockKeys);
  const pageTypeKeys = new Set(base.pageTypeKeys);
  const angleKeys = new Set(base.angleKeys);
  if (override) {
    for (const key of override.blockKeysRemove || []) blockKeys.delete(key);
    for (const key of override.blockKeysAdd || []) blockKeys.add(key);
    for (const key of override.pageTypeKeysRemove || []) pageTypeKeys.delete(key);
    for (const key of override.pageTypeKeysAdd || []) pageTypeKeys.add(key);
    for (const key of override.angleKeysRemove || []) angleKeys.delete(key);
    for (const key of override.angleKeysAdd || []) angleKeys.add(key);
  }

  const industry = store.industries.find((row) => row.id === base.industryId) || null;
  const blocks = store.blocks.filter(
    (row) => row.industryId === base.industryId && blockKeys.has(row.key) && row.status !== "disabled"
  );
  const pageTypes = store.pageTypes.filter(
    (row) => row.industryId === base.industryId && pageTypeKeys.has(row.key) && row.status !== "disabled"
  );
  const angles = store.angles.filter(
    (row) => row.industryId === base.industryId && angleKeys.has(row.key) && row.status !== "disabled"
  );

  return {
    industry,
    blueprint: base,
    override,
    blockKeys: [...blockKeys],
    pageTypeKeys: [...pageTypeKeys],
    angleKeys: [...angleKeys],
    blocks,
    pageTypes,
    angles,
  };
}
