import { GoogleGenerativeAI } from "@google/generative-ai";
import { DEFAULT_GEMINI_MODEL } from "../gemini-models";
import { parseCopyOverride } from "./copy-override";
import { buildMainLandingDesignBase } from "./build-base";
import type { MainLandingConfig, MainLandingCopyOverride, MainLandingVendor } from "./types";
import { resolveVariationSeed } from "./vary";

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

export type EnrichMainLandingInput = {
  config: MainLandingConfig;
  siteName: string;
  apiKey: string;
  model?: string;
};

/** 뼈대(섹션·개수)는 유지하고 문장만 키워드·지역에 맞게 다시 씀 */
export async function enrichMainLandingCopy(
  input: EnrichMainLandingInput
): Promise<MainLandingCopyOverride> {
  const apiKey = String(input.apiKey || "").trim();
  if (!apiKey) throw new Error("제미나이 API 키가 없습니다. 설정에서 키를 저장하세요.");

  const vendor: MainLandingVendor = input.config.vendor;
  const siteName = String(input.siteName || vendor.keyword || "").trim() || "사이트";
  const seed = resolveVariationSeed(input.config, siteName);
  const base = buildMainLandingDesignBase(input.config, siteName);
  const promptExtra = String(input.config.prompt || "").trim();

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: input.model || DEFAULT_GEMINI_MODEL,
    generationConfig: {
      temperature: 0.92,
      maxOutputTokens: 8192,
    },
  });

  const prompt = `당신은 지역 두피문신(SMP) 스튜디오 랜딩 카피라이터다.
아래는 동일한 섹션 뼈대의 기본 원고다. **구조·항목 개수는 유지**하고, 문장만 이 사이트 전용으로 새로 써라.

업체
- 키워드(히어로 제목으로 쓸 것, 바꾸지 말 것): ${vendor.keyword || siteName}
- 업체명: ${vendor.name || "(없음)"}
- 전화: ${vendor.phone || "(없음)"}
- 주소: ${vendor.address || base.displayAddress || "(없음)"}
- 카카오: ${vendor.kakao ? "있음" : "없음"}
- 추가 요청: ${promptExtra || "(없음)"}
- 변형 시드(이 시드마다 다른 표현·강조점): ${seed}

규칙
- 한국어. 과장 광고·이모지·해시태그·‘지금 예약’ 금지.
- 다른 지역에 그대로 붙여도 되는 상투 문장 금지. 이 키워드·이 동네 조합으로만 성립하게 쓸 것.
- heroTitle은 출력하지 않는다(키워드는 서버가 유지).
- aboutPromises는 정확히 3개, processSteps는 정확히 ${base.processSteps.length}개, services는 정확히 ${base.services.length}개.
- reviews는 정확히 ${base.reviews.length}개(가명·코스명 포함, 실존 인물 단정 금지).
- faqs는 정확히 ${base.faqs.length}개(q/a).
- directorGroups는 정확히 ${base.directorGroups.length}개, 각 items 3~5개.
- 전화번호·URL·사업자번호는 본문에 넣지 마라.

참고용 기본 원고(베끼지 말고 재작성):
${JSON.stringify(
  {
    tagline: base.tagline,
    heroKicker: base.heroKicker,
    heroSubtitle: base.heroSubtitle,
    heroLead: base.heroLead,
    heroHint: base.heroHint,
    aboutTitle: base.aboutTitle,
    aboutBody: base.aboutBody,
    aboutPromises: base.aboutPromises,
    processLead: base.processLead,
    processSteps: base.processSteps,
    servicesLead: base.servicesLead,
    services: base.services,
    galleryLead: base.galleryLead,
    directorLead: base.directorLead,
    directorGroups: base.directorGroups,
    reviewsLead: base.reviewsLead,
    reviews: base.reviews,
    faqLead: base.faqLead,
    faqs: base.faqs,
    footerTagline: base.footerTagline,
  },
  null,
  2
)}

반드시 JSON만 출력. 키:
tagline, heroKicker, heroSubtitle, heroLead, heroHint,
aboutKicker, aboutTitle, aboutBody, aboutPromises[{n,title,body}],
processKicker, processTitle, processLead, processSteps[{title,body}],
servicesKicker, servicesTitle, servicesLead, services[{title,body,tag?}],
galleryKicker, galleryTitle, galleryLead,
directorKicker, directorTitle, directorLead, directorGroups[{title,items[]}],
reviewsKicker, reviewsTitle, reviewsLead, reviews[{quote,name,course}],
faqKicker, faqTitle, faqLead, faqs[{q,a}],
footerTagline`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    throw new Error("제미나이가 JSON 형식으로 응답하지 않았습니다. 다시 시도해 주세요.");
  }
  const override = parseCopyOverride(parsed);
  if (!override?.heroLead && !override?.aboutBody) {
    throw new Error("제미나이 응답에 본문 필드가 없습니다.");
  }
  return override;
}
