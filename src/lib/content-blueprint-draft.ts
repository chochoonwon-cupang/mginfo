import { GoogleGenerativeAI } from "@google/generative-ai";
import { DEFAULT_GEMINI_MODEL } from "./gemini-models";
import { getContentBlueprintStore, applyIndustryDraftPack } from "./content-blueprint-store";

export type DraftBlockSuggestion = {
  key: string;
  name: string;
  description: string;
  verifiedDataRequired: boolean;
};

export type IndustryDraftSuggestion = {
  blocks: DraftBlockSuggestion[];
  angles: Array<{ key: string; name: string; description: string }>;
  pageTypes: Array<{ key: string; name: string; description: string }>;
  note?: string;
};

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function asList<T>(raw: unknown, map: (row: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      return map(item as Record<string, unknown>);
    })
    .filter((item): item is T => Boolean(item));
}

/**
 * Ask Gemini for industry-specific DRAFT blocks/angles (1 call).
 * Does not invent verified vendor facts — only section ideas.
 */
export async function suggestIndustryDraft(input: {
  industryId: string;
  apiKey: string;
  model?: string;
}): Promise<IndustryDraftSuggestion> {
  const store = await getContentBlueprintStore();
  const industry = store.industries.find((row) => row.id === input.industryId);
  if (!industry) throw new Error("업종을 찾을 수 없습니다.");

  const existingBlocks = store.blocks
    .filter((row) => row.industryId === industry.id)
    .map((row) => `${row.key}:${row.name}`)
    .join(", ");
  const hints = [
    ...(industry.resolverHints?.keywords || []),
    ...(industry.resolverHints?.serviceTerms || []),
  ].join(", ");

  const prompt = `당신은 한국어 지역 매거진 콘텐츠 설계자입니다.
업종에 맞는 「콘텐츠 블록」 초안만 제안하세요. 실제 업체 전화·주소·가격·재고는 만들지 마세요.

업종명: ${industry.name}
업종 설명: ${industry.description || "(없음)"}
매칭 힌트: ${hints || "(없음)"}
이미 있는 블록(중복 금지): ${existingBlocks || "(없음)"}

규칙:
- blocks 4~8개. key는 영문 snake_case.
- verifiedDataRequired는 대부분 false. 업체 실물/시공사례/매장정보가 꼭 필요할 때만 true.
- angles 2~4개, pageTypes 1~2개.
- JSON만 출력.

{
  "blocks": [{ "key": "...", "name": "...", "description": "...", "verifiedDataRequired": false }],
  "angles": [{ "key": "...", "name": "...", "description": "..." }],
  "pageTypes": [{ "key": "local_service", "name": "지역 서비스", "description": "..." }],
  "note": "한 줄 요약"
}`;

  const genAI = new GoogleGenerativeAI(input.apiKey);
  const model = genAI.getGenerativeModel({
    model: input.model || DEFAULT_GEMINI_MODEL,
    generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
  });
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const parsed = JSON.parse(extractJson(text)) as Record<string, unknown>;

  const blocks = asList(parsed.blocks, (row) => {
    const key = String(row.key || "").trim();
    const name = String(row.name || "").trim();
    if (!key || !name) return null;
    return {
      key,
      name,
      description: String(row.description || "").trim(),
      verifiedDataRequired: Boolean(row.verifiedDataRequired),
    };
  }).slice(0, 10);

  const angles = asList(parsed.angles, (row) => {
    const key = String(row.key || "").trim();
    const name = String(row.name || "").trim();
    if (!key || !name) return null;
    return { key, name, description: String(row.description || "").trim() };
  }).slice(0, 6);

  const pageTypes = asList(parsed.pageTypes, (row) => {
    const key = String(row.key || "").trim() || "local_service";
    const name = String(row.name || "").trim() || "지역 서비스";
    return { key, name, description: String(row.description || "").trim() };
  }).slice(0, 3);

  if (!blocks.length) throw new Error("초안 블록을 받지 못했습니다.");

  return {
    blocks,
    angles,
    pageTypes,
    note: String(parsed.note || "").trim() || undefined,
  };
}

/** Suggest + save as DRAFT into the industry catalog (still needs admin to activate). */
export async function draftAndApplyIndustryPack(input: {
  industryId: string;
  blueprintId?: string;
  apiKey: string;
  model?: string;
}) {
  const suggestion = await suggestIndustryDraft(input);
  const applied = await applyIndustryDraftPack({
    industryId: input.industryId,
    blueprintId: input.blueprintId,
    blocks: suggestion.blocks,
    angles: suggestion.angles,
    pageTypes: suggestion.pageTypes,
  });
  return { suggestion, applied };
}
