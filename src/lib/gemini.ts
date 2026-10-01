import { GoogleGenerativeAI } from "@google/generative-ai";
import { articleStyleRole, articleStyleRules, articleStyleTemperature, type ArticleStyle } from "./article-style";
import { parseFaqItems, type FaqItem } from "./faq";
import { DEFAULT_GEMINI_MODEL } from "./gemini-models";
import { fallbackFaqItems } from "./post-seo";
import { extractPlaceName, formatRegionMaterials, getNearbyDistricts, getNearbyStations, parseNameList } from "./region-geo";
import { formatPublicFactMaterials } from "./public-facts";
import { stripGeneratedImages } from "./sanitize";
import type { CategorySlug } from "./types";
import { resolveWritingTone, writingTonePrompt } from "./writing-tone";

export type GenerateInput = {
  topic?: string;
  writingStyle?: ArticleStyle;
  category: CategorySlug;
  categoryName?: string;
  keywords?: string;
  notes?: string;
  focusKeyword?: string;
  region?: string;
  localNotes?: string;
  experienceNotes?: string;
  vendorName?: string;
  writingTone?: string;
  writingPersona?: string;
  avoidTitles?: string[];
  avoidKeywords?: string[];
  apiKey: string;
  model: string;
};

export type GenerateResult = {
  title: string;
  excerpt: string;
  bodyHtml: string;
  tags: string[];
  slugHint?: string;
  faqItems?: FaqItem[];
  regionInfo?: string;
  nearbyAreas?: string[];
  nearbyStations?: string[];
};

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function visitExperienceRules(experienceNotes: string) {
  const notes = experienceNotes.trim();
  if (!notes) {
    return `- 고객 경험은 실명 가짜 후기가 아니라, 현장에서 반복되는 질문·방문 동선·선택 이유 같은 관찰로 쓴다.
- 추가 프롬프트(실제 방문 후기)가 없으면, 없는 방문·없는 메뉴·없는 1인칭 체험담을 만들지 말 것.`;
  }
  return `실제 방문 후기 메모(작성자가 직접 가서 적은 내용. 가짜 후기가 아니다):
"""
${notes}
"""
- 이 메모가 1차 취재원이다. 메모에 있는 가게·메뉴·맛·가격대·대기·공간·느낌만 사실로 쓴다.
- 메모를 그대로 붙이지 말고 매거진 후기글로 다듬어 완성한다. 짧은 메모라도 그 범위 안에서 글을 채운다.
- 메모에 없는 메뉴 이름, 정확한 원 단위 가격, 직원 실명, 없는 에피소드는 만들지 마라.
- 1인칭 방문 후기로 쓰되 체험단·광고 말투는 쓰지 않는다.`;
}

function uniquenessRules(input: GenerateInput): string {
  const region = (input.region || "").trim();
  const localNotes = (input.localNotes || "").trim();
  const experienceNotes = (input.experienceNotes || "").trim();
  const vendorName = (input.vendorName || "").trim();
  const place = extractPlaceName(region, input.focusKeyword, input.topic) || region;
  const subject = (input.focusKeyword || input.topic || "").trim();
  const materials = place ? formatRegionMaterials(place) : "";
  const publicFacts = place ? formatPublicFactMaterials(place, subject, input.categoryName) : "";

  return `유사문서 회피(이 키워드·이 지역 조합으로만 성립하는 글을 쓴다):
- 다른 키워드나 다른 동네에 붙여 넣어도 되는 문장·소제목은 쓰지 마라.
- 분양·맛집·시공처럼 같은 업종이라도, 대상의 고유 특성(견종·시술·메뉴·공간)을 본문에 구체적으로 넣는다.
- 일반 체크리스트(건강, 위생, 계약, 접종을 같은 순서로 나열)로 글을 채우지 마라. 이 키워드에서 실제로 갈리는 기준부터 쓴다.
- 요일, 날씨, ‘검색량이 꾸준’, ‘메모입니다’, ‘오늘 기준으로 다시’, ‘한 곳만 보기보다 주변을 이어서’ 같은 상투 문장 금지.
- 제목은 검색 의도를 담되 흔한 ‘완벽가이드·총정리·필수체크’ 패턴은 피한다.

regionInfo(글 하단 지역 안내, 3~5문장):
- 아래 지역 재료의 공식 지명·랜드마크·역·근방을 재료로, 이 키워드를 그 동네에서 찾는 사람 이야기로 자연스럽게 쓴다.
- 이 문단은 글 맨 위가 아니라 하단에 붙는다. 상단·본문 첫머리는 키워드의 핵심 판단만 남긴다.
- 재료 목록을 나열하거나 ‘A와 B가 있어 … 지역입니다’ 틀로 시작하지 마라.
- 메인 키워드를 한 번은 문장 안에 자연스럽게 넣는다. 문장마다 반복하지 마라.
- 없는 가게, 없는 거리 풍경, 없는 방문 일기는 만들지 마라. 재료에 있는 지명만 사실로 쓴다. 실제 방문 후기 메모가 있으면 그 가게·그 방문은 사실로 쓴다.

${materials || "- 지역이 키워드에 있으면 그 지명을 regionInfo와 본문에 구체화하라."}
${publicFacts ? `\n${publicFacts}` : ""}
- 지역 입력값: ${region || "(없음)"}
- 현장·지역 메모: ${localNotes || "(없음)"}
- 이 글의 고유 조합: ${[subject, place, vendorName].filter(Boolean).join(" · ") || "(키워드만)"}

공통 문체:
- 과장 광고, 이모지, 영어 해시태그, ‘지금 클릭’ 식 문장은 쓰지 않는다.
${visitExperienceRules(experienceNotes)}

업체 소개:
- 업체명: ${vendorName || "(없음)"}
${
  vendorName
    ? `- 본문에 "${vendorName}"을 2~3회, 그 지역·그 키워드 맥락에서만 자연스럽게 녹인다.
- 최저가, 지금 예약, 클릭, 상담 폭주 같은 홍보 문구는 금지.
- 전화번호, 홈페이지, 카카오 주소, tel/http 링크는 본문 HTML에 넣지 마라. 연락은 글 하단 버튼으로 따로 붙는다.
- 마지막 소제목을 업체 홍보나 공통 체크리스트로 닫지 마라.`
    : "- 특정 업체 홍보 문장은 넣지 않는다."
}`;
}

function avoidTitleRules(avoidTitles?: string[], avoidKeywords?: string[]): string {
  const titles = (avoidTitles || []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 40);
  const keywords = (avoidKeywords || []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 40);
  if (!titles.length && !keywords.length) return "";
  const titleBlock = titles.length
    ? `이미 쓴 제목(그대로 쓰거나 조금만 바꿔 쓰지 말 것):\n${titles.map((title) => `- ${title}`).join("\n")}`
    : "";
  const keywordBlock = keywords.length
    ? `오늘 이미 발행한 키워드(같은 틀·같은 각도의 제목 금지):\n${keywords.map((keyword) => `- ${keyword}`).join("\n")}`
    : "";
  return `제목 중복 금지:
${titleBlock}
${keywordBlock}
- 위 제목과 같거나 거의 같은 제목, 같은 키워드를 앞에 두고 뒷말만 살짝 바꾼 제목은 쓰지 마라.
- 검색 의도는 유지하되 각도·핵심 판단을 바꿔 새 제목을 만든다.`;
}

function seoRules(focusKeyword: string): string {
  if (!focusKeyword) {
    return `메인 키워드가 없으면 카테고리와 주제에 맞는 자연스러운 정보형 제목을 쓴다.`;
  }
  return `메인 키워드: "${focusKeyword}"
키워드를 글의 주제로 정확히 다루되, 검색용으로 끼워 넣지 마라.
- 제목 앞쪽에 메인 키워드를 자연스럽게 넣는다. 제목 28~48자, 이 키워드의 실제 검색 의도(비교, 주의, 동선, 조건 등)가 보이게.
- excerpt 첫 문장에 메인 키워드를 포함하고, 바로 이어서 이 글만의 핵심 한 줄을 쓴다.
- regionInfo에도 메인 키워드를 한 번만 자연스럽게 넣는다.
- 본문 첫 <p>는 regionInfo를 반복하지 말고, 이 키워드에서 가장 중요한 판단 포인트부터 시작한다.
- h2 3~5개 중 1~2개만 메인 키워드 또는 핵심 의미의 자연스러운 변형. 나머지 h2는 키워드 없이 구체적으로.
- 본문 전체 메인 키워드 4~7회. 한 문장에 두 번 넣지 말고, 연속 문장이 같은 키워드로 시작하지 마라.
- faqItems 3~4개. 질문은 실제로 검색될 법한 말로. 2개만 메인 키워드를 포함하고, 전부 같은 문장 틀로 시작하지 마라.
- 키워드 나열, 숨은 텍스트, 의미 없는 반복, 광고 문구는 금지한다.
- 키워드에 지역·품종·시술·메뉴가 있으면 그 대상의 고유 기준을 본문의 중심으로 삼는다.`;
}

/**
 * @deprecated V1 Production Engine uses `generatePipelineArticle` / `generateBulkArticle`
 * (Planner→Writer). Kept for QA compare and intentional legacy fallback only.
 */
export async function generateArticle(input: GenerateInput): Promise<GenerateResult> {
  const categoryName = input.categoryName || input.category;
  const focusKeyword = (input.focusKeyword || "").trim();
  const writingStyle = input.writingStyle || "magazine";
  const subject = focusKeyword || (input.topic || "").trim();
  const genAI = new GoogleGenerativeAI(input.apiKey);
  const model = genAI.getGenerativeModel({
    model: input.model || DEFAULT_GEMINI_MODEL,
    generationConfig: {
      temperature: articleStyleTemperature(writingStyle),
      maxOutputTokens: 8192,
    },
  });

  const prompt = `${articleStyleRole(writingStyle)}

카테고리: ${categoryName}
작성 대상(메인 키워드): ${subject || "(없음)"}
보조 키워드: ${input.keywords || "(없음)"}
추가 지시: ${input.notes || "(없음)"}
${seoRules(focusKeyword)}

${articleStyleRules(writingStyle)}

말투 우선순위: 글방향이 뉴스형이면 뉴스 단정. 그 외에는 사이트 기본 작성 톤. 글 형태 설명의 말투와 작성 톤이 다르면 작성 톤의 종결 어미를 따른다.

${writingTonePrompt(resolveWritingTone(writingStyle, input.writingTone), input.writingPersona)}

${uniquenessRules(input)}

${avoidTitleRules(input.avoidTitles, input.avoidKeywords)}

작업: 이 메인 키워드만으로 완결된 새 글을 쓴다. 글방향은 시선만 참고하고, 소제목과 전개는 키워드·지역·대상에 맞게 매번 새로 짠다. 다른 글의 목차를 채우지 마라. 실제 방문 후기 메모가 있으면 그 메모를 중심으로 후기글을 완성한다.

반드시 JSON만 출력한다. 설명 문장이나 마크다운 울타리는 넣지 않는다.
형식:
{
  "title": "한국어 제목",
  "excerpt": "2~3문장. 첫 문장은 메인 키워드로 시작. 이 글만의 핵심이 보이게. 지역이 있으면 지역명을 자연스럽게 포함",
  "bodyHtml": "HTML only. Use <h2>, <h3>, <p>, <strong>, <blockquote>, <ul><li>. 본문 2200~3200자. h2 소제목 3~5개. 인용 박스 1~2개. 이미지 태그 금지",
  "tags": ["태그1", "태그2", "태그3"],
  "slugHint": "english-kebab-case-slug",
  "regionInfo": "글 하단용 지역 안내 3~5문장. 상투 템플릿 금지. 메인 키워드 한 번",
  "nearbyAreas": ["근방동1", "근방동2", "근방동3", "근방동4", "근방동5"],
  "nearbyStations": ["역1", "역2", "역3", "역4", "역5"],
  "faqItems": [
    { "question": "실제로 검색될 법한 질문", "answer": "2~3문장 답변" }
  ]
}

본문 HTML 규칙:
- <html>, <body> 없이 본문 조각만
- 지역 소개 문단은 regionInfo에만 넣고 본문에서 같은 문장을 반복하지 말 것. 본문에는 그 동네 동선·역·공간을 판단 기준으로 녹인다.
- 공공 숫자 표·지역 기록 블록은 서버가 본문 끝에 붙인다. 같은 표를 본문에 다시 쓰지 마라.
- 중요한 기준·숫자·조건·결론은 <strong>으로 강조한다. 한 문단에 한 곳, 글 전체 4~8회. 문장 전체를 굵게 하지 말 것.
- <img>, <figure>, 이미지 URL 금지
- 연락처·URL은 본문에 넣지 않기`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  let parsed: GenerateResult;
  try {
    parsed = JSON.parse(extractJson(text)) as GenerateResult;
  } catch {
    throw new Error("제미나이가 JSON 형식으로 응답하지 않았습니다. 다시 시도해 주세요.");
  }
  if (!parsed.title || !parsed.bodyHtml) {
    throw new Error("제미나이 응답에 제목 또는 본문이 없습니다.");
  }
  const tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : [];
  if (focusKeyword && !tags.includes(focusKeyword)) {
    tags.unshift(focusKeyword);
  }
  const faqItems =
    parseFaqItems((parsed as GenerateResult).faqItems) ||
    fallbackFaqItems(
      {
        id: "",
        slug: "",
        title: parsed.title,
        excerpt: parsed.excerpt || "",
        bodyHtml: parsed.bodyHtml,
        category: input.category,
        tags,
        focusKeyword: focusKeyword || undefined,
        region: (input.region || "").trim() || undefined,
        status: "draft",
        publishedAt: null,
        createdAt: "",
        updatedAt: "",
      },
      input.categoryName
    );
  const place = extractPlaceName(input.region, focusKeyword, input.topic, parsed.title) || (input.region || "").trim();
  const regionInfo = String((parsed as GenerateResult).regionInfo || "").trim();
  const nearbyAreas = parseNameList((parsed as GenerateResult).nearbyAreas) || (place ? getNearbyDistricts(place) : undefined);
  const nearbyStations =
    parseNameList((parsed as GenerateResult).nearbyStations) || (place ? getNearbyStations(place) : undefined);
  return {
    title: parsed.title,
    excerpt: parsed.excerpt || "",
    bodyHtml: stripGeneratedImages(parsed.bodyHtml),
    tags: tags.slice(0, 8),
    slugHint: parsed.slugHint,
    faqItems: faqItems.length ? faqItems : undefined,
    regionInfo: regionInfo || undefined,
    nearbyAreas,
    nearbyStations,
  };
}
