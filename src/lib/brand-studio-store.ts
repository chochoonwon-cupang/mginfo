import fs from "fs";
import path from "path";
import { blobGetBrandStudioJson, blobSetBrandStudioJson, hasBlobStore } from "./blob-store";
import { hasRemoteStore, kvGetBrandStudioJson, kvSetBrandStudioJson } from "./kv";
import { defaultMainLandingConfig, parseMainLandingConfig, type MainLandingConfig } from "./main-landing";
import { uid } from "./slug";

const LOCAL_PATH = path.join(process.cwd(), "data", "brand-studio.json");

export type BrandStudioDraft = {
  id: string;
  title: string;
  apexDomain: string;
  keywords: string[];
  mainLanding: MainLandingConfig;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type BrandStudioStore = {
  drafts: BrandStudioDraft[];
};

function emptyStore(): BrandStudioStore {
  return { drafts: [] };
}

function parseDraft(raw: unknown, current?: BrandStudioDraft): BrandStudioDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const now = new Date().toISOString();
  const keywords = Array.isArray(row.keywords)
    ? row.keywords.map((item) => String(item || "").trim()).filter(Boolean)
    : current?.keywords || [];
  const title = String(row.title ?? current?.title ?? "").trim() || keywords[0] || "브랜드 초안";
  return {
    id: String(row.id || current?.id || uid()).trim(),
    title,
    apexDomain: String(row.apexDomain ?? current?.apexDomain ?? "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "")
      .toLowerCase(),
    keywords,
    mainLanding: parseMainLandingConfig(row.mainLanding ?? current?.mainLanding ?? defaultMainLandingConfig()),
    notes: String(row.notes ?? current?.notes ?? "").trim(),
    createdAt: current?.createdAt || String(row.createdAt || now),
    updatedAt: now,
  };
}

function normalize(raw: unknown): BrandStudioStore {
  if (!raw || typeof raw !== "object") return emptyStore();
  const row = raw as { drafts?: unknown };
  const drafts = Array.isArray(row.drafts)
    ? row.drafts.map((item) => parseDraft(item)).filter((item): item is BrandStudioDraft => Boolean(item))
    : [];
  return { drafts };
}

async function loadStore(): Promise<BrandStudioStore> {
  if (hasRemoteStore()) {
    const fromKv = await kvGetBrandStudioJson<BrandStudioStore>();
    if (fromKv) return normalize(fromKv);
  }
  if (hasBlobStore()) {
    const fromBlob = await blobGetBrandStudioJson<BrandStudioStore>();
    if (fromBlob) return normalize(fromBlob);
  }
  try {
    if (fs.existsSync(LOCAL_PATH)) {
      return normalize(JSON.parse(fs.readFileSync(LOCAL_PATH, "utf8")));
    }
  } catch {
    /* ignore */
  }
  return emptyStore();
}

async function persist(store: BrandStudioStore) {
  if (hasRemoteStore()) {
    await kvSetBrandStudioJson(store);
    return;
  }
  if (hasBlobStore()) {
    await blobSetBrandStudioJson(store);
    return;
  }
  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function getBrandStudioDrafts() {
  return (await loadStore()).drafts;
}

export async function upsertBrandStudioDraft(raw: Record<string, unknown>) {
  const store = await loadStore();
  const current = store.drafts.find((row) => row.id === String(raw.id || ""));
  const draft = parseDraft(raw, current);
  if (!draft) throw new Error("초안을 만들지 못했습니다.");
  const next = store.drafts.filter((row) => row.id !== draft.id);
  next.unshift(draft);
  await persist({ drafts: next });
  return draft;
}

export async function deleteBrandStudioDraft(id: string) {
  const store = await loadStore();
  const next = store.drafts.filter((row) => row.id !== id);
  await persist({ drafts: next });
  return next;
}

/** keyword + apex → unicode host + ASCII hostname preview (Phase 1 display only). */
export function previewBrandHost(keyword: string, apexDomain: string) {
  const apex = String(apexDomain || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  const label = String(keyword || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\.+/g, "");
  if (!apex || !label) return { host: "", punycode: "" };
  const host = `${label}.${apex}`;
  let punycode = host;
  try {
    punycode = new URL(`https://${host}`).hostname;
  } catch {
    punycode = host;
  }
  return { host, punycode };
}
