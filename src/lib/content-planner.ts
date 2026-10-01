import type { ContentBlock, ContentAngle, PageType } from "./content-blueprint-types";
import type { PagePlan, RegionalFacts, RelatedPostSummary } from "./page-plan-types";
import { parsePagePlan } from "./page-plan-schema";
import type { ResolvedBlueprint } from "./content-industry-resolve";
import { extractPlaceName } from "./region-geo";
import { summarizeAngleDistribution } from "./content-related-context";
import { PLANNER_PROMPT_VERSION } from "./quality-codes";
import { readGeminiTokenUsage } from "./gemini-usage";
import type { TokenUsage } from "./page-plan-types";
import { uid } from "./slug";
import type { VerifiedContextMeta } from "./verified-availability";
import { formatVerifiedContextForPlanner } from "./verified-availability";


function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function listBlocks(blocks: ContentBlock[]): string {
  return blocks
    .filter((b) => b.status === "active")
    .map(
      (b) =>
        `- ${b.key}: ${b.name} — ${b.description}` +
        (b.verifiedDataRequired ? " [verifiedDataRequired]" : "") +
        (b.allowedPageTypes.length ? ` (pageTypes: ${b.allowedPageTypes.join(",")})` : "")
    )
    .join("\n");
}

function listPageTypes(rows: PageType[]): string {
  return rows
    .filter((r) => r.status === "active")
    .map((r) => `- ${r.key}: ${r.name} — ${r.description}`)
    .join("\n");
}

function listAngles(rows: ContentAngle[]): string {
  return rows
    .filter((r) => r.status === "active")
    .map((r) => `- ${r.key}: ${r.name} — ${r.description}`)
    .join("\n");
}

function formatRelated(related: RelatedPostSummary[]): string {
  if (!related.length) return "(관련 최근 글 없음)";
  return related
    .slice(0, 8)
    .map((row, i) => {
      const h2 = row.h2List.slice(0, 8).join(" | ") || "(h2 없음)";
      return `${i + 1}. keyword=${row.keyword || "-"} | title=${row.title} | pageType=${row.pageType || "-"} | angle=${row.contentAngle || "-"} | H2=${h2}`;
    })
    .join("\n");
}

function formatRegionalFacts(facts?: RegionalFacts): string {
  if (!facts || !facts.facts?.length) {
    return `(없음 — 지역은 서비스 대상 지역·검색의 지리적 범위로만 취급. 주거형태·소득·가족구성·성향 추론 금지)`;
  }
  return `region=${facts.region} source=${facts.source || "system"}\n${facts.facts.map((f) => `- ${f}`).join("\n")}`;
}

export function buildPlannerPrompt(input: {
  keyword: string;
  pool: ResolvedBlueprint;
  related: RelatedPostSummary[];
  vendorName?: string;
  hasVerifiedVendor?: boolean;
  hasVerifiedAnimals?: boolean;
  regionalFacts?: RegionalFacts;
  availableVerifiedBlocks?: string[];
  verifiedContext?: VerifiedContextMeta;
}): string {
  const industry = input.pool.industry;
  const blueprint = input.pool.blueprint;
  const place = extractPlaceName(input.keyword) || "";
  const angleDist = summarizeAngleDistribution(input.related);
  const availableVerified = (input.availableVerifiedBlocks || []).join(", ") || "(없음 — verified/code 블록 사용 불가)";
  const verifiedMeta = input.verifiedContext
    ? formatVerifiedContextForPlanner(input.verifiedContext)
    : "(메타 없음)";

  return `당신은 매거진 페이지의 Planner다. 글을 쓰지 말고 PagePlan JSON만 만든다.

역할:
- Blueprint는 고정 목차가 아니라 사용 가능한 블록 풀이다.
- searchIntent와 contentStrategy를 분리한다.
- 페이지 차별화는 contentStrategy·contentAngle·sections로 만든다. searchIntent를 억지로 다르게 만들지 마라.

【Grounding — 지역 추론 금지】
지역명만 보고 검색자 성향·소득·주거·가족구성·아파트·생활수준·검색패턴·소비성향을 추론하지 마라.
금지 예: "송도→고층", "청라→가족", "강남→고소득", "배곧→초보".
근거 없으면 지역은 서비스 대상 지역·지리적 범위로만.

【searchIntent vs contentStrategy】
- searchIntent: 키워드에서 합리적으로 읽히는 목적. 같은 계열이면 비슷해도 정상.
- contentStrategy: 그 의도를 충족하는 이번 페이지 정보 구성.

【Verified blocks — 사전 가용 목록】
아래 availableVerifiedBlocks만 실제 DB/코드로 렌더 가능하다.
목록에 없는 verified/code 블록을 sections에 넣지 마라 (넣어도 서버가 제거한다).
availableVerifiedBlocks: ${availableVerified}
verifiedContext (match 메타 — 개인정보/전체 DB 아님):
${verifiedMeta}
목록에 있는 verified/code 블록만 heading·purpose를 계획하라. Gemini가 본문을 쓰지 않고 코드가 HTML을 만든다.
(업종별로 availableVerifiedBlocks 내용이 다르다. 다른 업종 블록 이름을 예시로 끌어오지 마라.)

【Verified heading grounding — 필수】
- project_examples / available_animals heading은 Verified 데이터의 실제 match 범위를 넘지 마라.
- match=exact 일 때만 "○○ 지역 ○○ 실제 사례"처럼 지역·유형을 단정하는 heading 가능.
- match=type|region 이거나 safeHeading이 있으면 그 범위를 지켜라. 예: "확인 가능한 상가 철거 사례".
- 해당 지역 사례가 없는데 "송파 상가 철거 실제 사례"처럼 쓰지 마라.
- 서버가 heading을 교정할 수 있으나, Planner가 처음부터 과대 heading을 만들지 마라.

【Angle 선택】
keyword, industry, blueprint, 키워드 sub-topic, 최근 angle 분포, H2, verified 존재·match 여부.
지역→페르소나로 angle 고르지 마라. 단순 랜덤 금지.

업종: ${industry?.name || ""} (${industry?.id || ""})
Blueprint: ${blueprint.key} v${blueprint.version} — ${blueprint.description}

키워드: ${input.keyword}
지리적 범위: ${place || "(없음)"}
업체명(참고): ${input.vendorName || "(없음)"}
Verified vendor facts: ${input.hasVerifiedVendor ? "일부 있음" : "없음"}
Verified inventory (animals 또는 project cases): ${input.hasVerifiedAnimals ? "있음" : "없음"}

Regional facts:
${formatRegionalFacts(input.regionalFacts)}

사용 가능한 Page Types:
${listPageTypes(input.pool.pageTypes)}

사용 가능한 Content Angles:
${listAngles(input.pool.angles)}

사용 가능한 Content Blocks:
${listBlocks(input.pool.blocks)}

최근 관련 글 Angle 분포: ${angleDist}

최근 관련 글 요약:
${formatRelated(input.related)}

규칙:
1. searchIntent / contentStrategy / topicContext / angleReason / section.purpose 필수.
2. topicContext.subTopics는 키워드·facts에 있는 것만. 키워드에서 읽히는 region·service·projectType 정도만.
3. heading·본문 계획에 근거 없는 지역 특성·고객 성향 추론 금지 (예: 강남=고가, 서초=고급).
4. internalLinkHints는 의도만.
5. availableVerifiedBlocks에 없는 verified 블록을 넣지 마라.
6. 【정보량 — 얇은 페이지 방지】
   Verified 블록만으로 끝내지 마라. 위 Content Blocks 목록에서 AI 정보 블록(verifiedDataRequired 아닌 active)을
   contentStrategy에 맞게 고른다. faq·verified를 제외하고 AI 섹션을 최소 3개 이상 권장.
   고정 목차 금지. 다른 업종(분양/견종 등) 블록 이름을 끌어와 예시를 만들지 마라.
   목표: 글자수 채우기가 아니라 의뢰·상담 전 판단에 필요한 정보량.
7. availableVerifiedBlocks에 project_examples가 있으면 real_case_focused 등 사례 앵글을,
   available_animals가 있으면 real_animal 앵글을 우선 검토하되 최근 angle 분포 중복을 피하라.
   match가 exact가 아니면 "해당 지역 실제 사례" 중심 앵글/heading을 피하라.
8. JSON만 출력.

형식:
{
  "planId": "plan-...",
  "keyword": "${input.keyword}",
  "industryId": "${blueprint.industryId}",
  "blueprintId": "${blueprint.id}",
  "blueprintVersion": ${blueprint.version},
  "pageType": "...",
  "contentAngle": "...",
  "angleReason": "...",
  "searchIntent": { "primary": "...", "secondary": [], "userGoal": "..." },
  "contentStrategy": { "summary": "...", "rationale": "..." },
  "topicContext": { "region": "${place || ""}", "primaryTopic": "...", "service": "...", "subTopics": [] },
  "regionalFacts": { "region": "${place || ""}", "facts": [] },
  "titleHint": "...",
  "metaDescriptionHint": "...",
  "excludeBlockKeys": [],
  "sections": [
    { "blockKey": "...", "heading": "...", "intent": "...", "purpose": "...", "mustUseVerifiedData": false, "notesForWriter": "..." }
  ],
  "faqQuestions": [],
  "internalLinkHints": []
}`;
}

export async function callPlanner(input: {
  apiKey: string;
  model: string;
  keyword: string;
  pool: ResolvedBlueprint;
  related: RelatedPostSummary[];
  vendorName?: string;
  hasVerifiedVendor?: boolean;
  hasVerifiedAnimals?: boolean;
  regionalFacts?: RegionalFacts;
  availableVerifiedBlocks?: string[];
  verifiedContext?: VerifiedContextMeta;
}): Promise<{ plan: PagePlan; rawText: string; calls: number; tokens?: TokenUsage; promptVersion: string }> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(input.apiKey);
  const model = genAI.getGenerativeModel({
    model: input.model,
    generationConfig: { temperature: 0.65, maxOutputTokens: 4096 },
  });

  const allowedBlockKeys = new Set(input.pool.blocks.filter((b) => b.status === "active").map((b) => b.key));
  const allowedPageTypes = new Set(input.pool.pageTypes.filter((p) => p.status === "active").map((p) => p.key));
  const allowedAngles = new Set(input.pool.angles.filter((a) => a.status === "active").map((a) => a.key));
  const defaults = {
    keyword: input.keyword,
    industryId: input.pool.blueprint.industryId,
    blueprintId: input.pool.blueprint.id,
    blueprintVersion: input.pool.blueprint.version,
    allowedBlockKeys,
    allowedPageTypes,
    allowedAngles,
  };

  const prompt = buildPlannerPrompt(input);
  let calls = 0;
  let lastError = "";
  let tokens: TokenUsage | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    calls += 1;
    const result = await model.generateContent(
      attempt === 0
        ? prompt
        : `${prompt}\n\n이전 응답이 Schema 검증에 실패했다. 오류: ${lastError}\n올바른 JSON만 다시 출력하라. contentStrategy 필수. 지역 성향 추론 금지.`
    );
    tokens = mergeOrKeep(tokens, readGeminiTokenUsage(result.response));
    const rawText = result.response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(rawText));
    } catch {
      lastError = "JSON 파싱 실패";
      continue;
    }
    const checked = parsePagePlan(parsed, defaults);
    if (checked.ok) {
      const place = extractPlaceName(input.keyword) || "";
      const plan: PagePlan = {
        ...checked.plan,
        planId: checked.plan.planId || `plan-${uid()}`,
        keyword: input.keyword,
        industryId: defaults.industryId,
        blueprintId: defaults.blueprintId,
        blueprintVersion: defaults.blueprintVersion,
        regionalFacts:
          input.regionalFacts && input.regionalFacts.facts.length
            ? input.regionalFacts
            : { region: place, facts: [] },
      };
      return { plan, rawText, calls, tokens, promptVersion: PLANNER_PROMPT_VERSION };
    }
    lastError = checked.error;
  }

  throw new Error(`Planner Schema 실패: ${lastError || "unknown"}`);
}

function mergeOrKeep(prev: TokenUsage | undefined, next: TokenUsage): TokenUsage {
  if (!prev) return next;
  const sum = (a: number | null, b: number | null) =>
    a == null && b == null ? null : (a || 0) + (b || 0);
  return {
    inputTokens: sum(prev.inputTokens, next.inputTokens),
    outputTokens: sum(prev.outputTokens, next.outputTokens),
    totalTokens: sum(prev.totalTokens, next.totalTokens),
  };
}
