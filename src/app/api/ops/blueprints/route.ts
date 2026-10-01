import { NextResponse } from "next/server";
import { checkMasterPassword, isMasterSession } from "@/lib/auth";
import { draftAndApplyIndustryPack } from "@/lib/content-blueprint-draft";
import {
  getContentBlueprintStore,
  resetContentBlueprintsToSeed,
  setBlockStatus,
  setBlueprintBlockKeys,
  setBlueprintStatus,
  setIndustryStatus,
  updateIndustryHints,
  upsertBlock,
  upsertIndustry,
} from "@/lib/content-blueprint-store";
import type { CatalogStatus } from "@/lib/content-blueprint-types";
import { getSettings } from "@/lib/db";
import { isOpsHub } from "@/lib/ops-hub";
import { persistFail } from "@/lib/persist-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  }
  return String(value || "")
    .split(/[,|\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function authorize(request: Request) {
  if (await isMasterSession()) return true;
  const header = request.headers.get("x-infocs-master") || "";
  return checkMasterPassword(header);
}

export async function GET(request: Request) {
  if (!(await isOpsHub())) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "마스터만 볼 수 있습니다." }, { status: 401 });
  }
  try {
    const store = await getContentBlueprintStore();
    return NextResponse.json({ ok: true, store });
  } catch (err) {
    return persistFail(err);
  }
}

export async function PATCH(request: Request) {
  if (!(await isOpsHub())) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "마스터만 저장할 수 있습니다." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "").trim();
  const status = String(body.status || "").trim() as CatalogStatus;
  try {
    if (action === "setBlueprintStatus") {
      if (!["draft", "active", "disabled"].includes(status)) {
        return NextResponse.json({ error: "상태가 올바르지 않습니다." }, { status: 400 });
      }
      const result = await setBlueprintStatus(String(body.blueprintId || ""), status);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
      return NextResponse.json(result);
    }
    if (action === "setBlockStatus") {
      if (!["draft", "active", "disabled"].includes(status)) {
        return NextResponse.json({ error: "상태가 올바르지 않습니다." }, { status: 400 });
      }
      const result = await setBlockStatus(String(body.blockId || ""), status);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
      return NextResponse.json(result);
    }
    if (action === "setIndustryStatus") {
      if (!["draft", "active", "disabled"].includes(status)) {
        return NextResponse.json({ error: "상태가 올바르지 않습니다." }, { status: 400 });
      }
      const result = await setIndustryStatus(String(body.industryId || ""), status);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
      return NextResponse.json(result);
    }
    if (action === "updateIndustryHints") {
      const result = await updateIndustryHints(String(body.industryId || ""), {
        name: body.name !== undefined ? String(body.name || "") : undefined,
        description: body.description !== undefined ? String(body.description || "") : undefined,
        keywords: body.keywords !== undefined ? asStringList(body.keywords) : undefined,
        aliases: body.aliases !== undefined ? asStringList(body.aliases) : undefined,
        serviceTerms: body.serviceTerms !== undefined ? asStringList(body.serviceTerms) : undefined,
        negativeTerms: body.negativeTerms !== undefined ? asStringList(body.negativeTerms) : undefined,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
      return NextResponse.json(result);
    }
    if (action === "upsertIndustry") {
      const result = await upsertIndustry({
        id: String(body.id || "").trim() || undefined,
        key: String(body.key || "").trim(),
        name: String(body.name || "").trim(),
        description: String(body.description || "").trim() || undefined,
        status: ["draft", "active", "disabled"].includes(status) ? status : "draft",
        withStarterPack: body.withStarterPack !== false,
        resolverHints: {
          keywords: asStringList(body.keywords),
          aliases: asStringList(body.aliases),
          serviceTerms: asStringList(body.serviceTerms),
          negativeTerms: asStringList(body.negativeTerms),
        },
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json(result);
    }
    if (action === "upsertBlock") {
      const result = await upsertBlock({
        id: String(body.id || "").trim() || undefined,
        industryId: String(body.industryId || "").trim(),
        key: String(body.key || "").trim(),
        name: String(body.name || "").trim(),
        description: String(body.description || "").trim() || undefined,
        verifiedDataRequired: Boolean(body.verifiedDataRequired),
        optional: body.optional === undefined ? true : Boolean(body.optional),
        status: ["draft", "active", "disabled"].includes(status) ? status : "draft",
        addToBlueprintId: String(body.addToBlueprintId || "").trim() || undefined,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json(result);
    }
    if (action === "setBlueprintBlockKeys") {
      const keys = asStringList(body.blockKeys);
      const result = await setBlueprintBlockKeys(String(body.blueprintId || ""), keys);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
      return NextResponse.json(result);
    }
    if (action === "draftIndustryPack") {
      const settings = await getSettings();
      const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || "";
      if (!apiKey) {
        return NextResponse.json({ error: "제미나이 API 키가 없습니다." }, { status: 400 });
      }
      const industryId = String(body.industryId || "").trim();
      if (!industryId) return NextResponse.json({ error: "업종을 선택하세요." }, { status: 400 });
      try {
        const result = await draftAndApplyIndustryPack({
          industryId,
          blueprintId: String(body.blueprintId || "").trim() || undefined,
          apiKey,
          model: settings.geminiModel,
        });
        if (!result.applied.ok) {
          return NextResponse.json(
            { error: result.applied.error, suggestion: result.suggestion },
            { status: 400 }
          );
        }
        return NextResponse.json({
          ok: true,
          store: result.applied.store,
          suggestion: result.suggestion,
          added: result.applied.added,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "초안 생성 실패";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }
    if (action === "resetSeed") {
      const store = await resetContentBlueprintsToSeed();
      return NextResponse.json({ ok: true, store });
    }
    return NextResponse.json({ error: "알 수 없는 동작입니다." }, { status: 400 });
  } catch (err) {
    return persistFail(err);
  }
}
