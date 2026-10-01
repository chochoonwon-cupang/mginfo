import fs from "fs";
import path from "path";
import { blobGetJson, blobSetJson, hasBlobStore } from "./blob-store";
import { PersistError } from "./db";
import { seoulDateKey } from "./publish-limits";
import { uid } from "./slug";
import {
  emptyPilotDay,
  emptyPilotStore,
  type PilotDayMetrics,
  type PilotEvent,
  type PilotStore,
} from "./pilot-types";

const LOCAL_PATH = path.join(process.cwd(), "data", "bulk-pilot.json");
const BLOB_PATH = "infocs-bulk-pilot.json";

function normalize(raw: unknown): PilotStore {
  if (!raw || typeof raw !== "object") return emptyPilotStore();
  const row = raw as Partial<PilotStore>;
  const events = Array.isArray(row.events) ? (row.events as PilotEvent[]) : [];
  const days =
    row.days && typeof row.days === "object" ? (row.days as Record<string, PilotDayMetrics>) : {};
  return {
    events: events.filter((e) => e && e.id && e.keyword).slice(0, 500),
    days,
    updatedAt: String(row.updatedAt || new Date().toISOString()),
  };
}

async function load(): Promise<PilotStore> {
  if (hasBlobStore()) {
    const remote = await blobGetJson<PilotStore>(BLOB_PATH);
    if (remote) return normalize(remote);
    return emptyPilotStore();
  }
  try {
    if (!fs.existsSync(LOCAL_PATH)) return emptyPilotStore();
    return normalize(JSON.parse(fs.readFileSync(LOCAL_PATH, "utf8")));
  } catch {
    return emptyPilotStore();
  }
}

async function save(store: PilotStore): Promise<PilotStore> {
  const next = { ...store, updatedAt: new Date().toISOString() };
  try {
    if (hasBlobStore()) {
      await blobSetJson(next, BLOB_PATH);
      return next;
    }
    if (process.env.VERCEL) {
      throw new PersistError("Pilot metrics는 Blob에서만 저장할 수 있습니다.");
    }
    fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
    fs.writeFileSync(LOCAL_PATH, JSON.stringify(next, null, 2), "utf8");
    return next;
  } catch (err) {
    if (err instanceof PersistError) throw err;
    throw new PersistError(err instanceof Error ? err.message : "Pilot 저장 실패");
  }
}

function applyEventToDay(day: PilotDayMetrics, event: PilotEvent): PilotDayMetrics {
  const next = { ...day, warningCodeCounts: { ...day.warningCodeCounts } };
  next.attempted += 1;
  next.plannerRetries += event.plannerRetries || 0;
  next.writerRetries += event.writerRetries || 0;
  next.totalGeminiCalls += event.geminiCalls || 0;

  const addTok = (field: "inputTokens" | "outputTokens" | "totalTokens", v: number | null | undefined) => {
    if (v == null || !Number.isFinite(v)) return;
    next[field] = (next[field] ?? 0) + v;
  };
  addTok("inputTokens", event.inputTokens);
  addTok("outputTokens", event.outputTokens);
  addTok("totalTokens", event.totalTokens);

  for (const code of event.warningCodes || []) {
    next.warningCodeCounts[code] = (next.warningCodeCounts[code] || 0) + 1;
  }

  switch (event.outcome) {
    case "published_pass":
      next.published += 1;
      next.passPublished += 1;
      break;
    case "published_warn":
      next.published += 1;
      next.warnPublished += 1;
      break;
    case "held":
      next.held += 1;
      break;
    case "skipped_duplicate":
      next.duplicateSkipped += 1;
      break;
    case "skipped_unresolved":
      next.industryUnresolved += 1;
      break;
    case "skipped_industry":
      next.industrySkipped += 1;
      break;
    case "technical_failure":
      next.technicalFailure += 1;
      break;
    case "quality_failure":
      next.qualityFailure += 1;
      break;
    case "verified_data_failure":
      next.verifiedDataFailure += 1;
      break;
    case "legacy_fallback":
      next.legacyFallback += 1;
      next.published += 1;
      break;
    default:
      break;
  }

  if (event.legacyFallback && event.outcome !== "legacy_fallback") {
    next.legacyFallback += 1;
  }

  next.averageGeminiCalls = next.attempted ? next.totalGeminiCalls / next.attempted : 0;
  return next;
}

export async function getPilotStore(): Promise<PilotStore> {
  return load();
}

export async function getPilotDay(date = seoulDateKey()): Promise<PilotDayMetrics> {
  const store = await load();
  return store.days[date] || emptyPilotDay(date);
}

/** Successful pilot publishes today (PASS / WARN / legacy that created a Post). */
export async function countPilotPublishedToday(date = seoulDateKey()): Promise<number> {
  const day = await getPilotDay(date);
  return day.published;
}

export async function appendPilotEvent(
  partial: Omit<PilotEvent, "id" | "at" | "seoulDate"> & Partial<Pick<PilotEvent, "id" | "at" | "seoulDate">>
): Promise<PilotEvent> {
  const store = await load();
  const at = partial.at || new Date().toISOString();
  const seoulDate = partial.seoulDate || seoulDateKey(at) || seoulDateKey();
  const event: PilotEvent = {
    ...partial,
    id: partial.id || uid(),
    at,
    seoulDate,
  };
  store.events = [event, ...store.events].slice(0, 500);
  const day = store.days[seoulDate] || emptyPilotDay(seoulDate);
  store.days[seoulDate] = applyEventToDay(day, event);
  await save(store);
  return event;
}

export async function updatePilotEventPublicSample(
  eventId: string,
  publicSample: NonNullable<PilotEvent["publicSample"]>
): Promise<void> {
  const store = await load();
  const idx = store.events.findIndex((e) => e.id === eventId);
  if (idx < 0) return;
  store.events[idx] = { ...store.events[idx], publicSample };
  await save(store);
}

export function pilotDashboardView(store: PilotStore, today = seoulDateKey()) {
  const day = store.days[today] || emptyPilotDay(today);
  const recentPublished = store.events
    .filter((e) => e.outcome === "published_pass" || e.outcome === "published_warn" || e.outcome === "legacy_fallback")
    .slice(0, 10);
  const recentHeld = store.events.filter((e) => e.outcome === "held").slice(0, 10);
  return {
    today: day,
    recentPublished,
    recentHeld,
    warningCodes: day.warningCodeCounts,
    updatedAt: store.updatedAt,
  };
}
