import { GoogleGenerativeAI } from "@google/generative-ai";
import { DEFAULT_GEMINI_MODEL } from "./gemini-models";
import { pickPooledSiteIntro } from "./site-intro-pool";

const BLAND_TAGLINES = new Set([
  "모든 생활 정보를 한눈에",
  "Curated Life & Trend",
  "오늘 밤의 생활 정보",
  "일상을 기록하는 블로그",
  "궁금한 생활 정보를 찾아보세요",
  "오늘의 순간을 모아 보세요",
  "오늘 필요한 정보를 한곳에서",
  "당신 근처의 생활 정보",
  "영상처럼 쉽고, 바로 써먹는 생활 가이드",
]);

const FALLBACK_TEMPLATES = [
  (k: string) => `${k} 정보가 필요하면 시술·선택 전후로 꼭 볼 포인트만 짧게 모았습니다.`,
  (k: string) => `${k} 알아보는 중이라면, 비용·과정·주의점 기준으로 먼저 정리해 두었습니다.`,
  (k: string) => `${k} 검색하셨다면 상담 전에 확인할 핵심만 골랐습니다. 들어가서 바로 비교해 보세요.`,
  (k: string) => `${k} 고민이 있을 때 읽기 좋은 실무 가이드입니다. 과장 없이 체크리스트 중심으로.`,
  (k: string) => `${k} 관련 질문(효과·유지·후기 포인트)을 한곳에 모아 두었습니다.`,
  (k: string) => `${k} 알아보기 전, 놓치기 쉬운 기준과 방문 전 질문만 추렸습니다.`,
  (k: string) => `${k} 정보가 흩어져 있다면 여기서 먼저 흐름을 잡고 세부 글을 이어서 보세요.`,
  (k: string) => `${k} 선택 전 확인 포인트와 자주 묻는 답을 간결하게 담았습니다.`,
  (k: string) => `${k} 검색 결과를 줄이려면, 지역·시술 기준만 빠르게 훑어보세요.`,
  (k: string) => `${k} 관심이 생겼다면 비교에 쓰는 핵심 문장만 모아 두었습니다.`,
];

export function isBlandSiteTagline(tagline?: string | null) {
  const text = String(tagline || "").trim();
  if (!text) return true;
  if (BLAND_TAGLINES.has(text)) return true;
  if (/모든 생활 정보/.test(text) && text.length < 40) return true;
  return false;
}

function hashPick(text: string, mod: number) {
  let h = 2166136261;
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % Math.max(1, mod);
}

function clampTagline(text: string, keyword: string): string {
  let out = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^["'\u300c\u300e]|["'\u300d\u300f]$/g, "")
    .trim();
  out = out.replace(/^메타\s*설명\s*[:\uFF1A]\s*/i, "").trim();
  const key = String(keyword || "").trim() || "생활정보";
  if (!out) {
    const idx = hashPick(`${key}|clamp|seo-tagline`, FALLBACK_TEMPLATES.length);
    const build = FALLBACK_TEMPLATES[idx] || FALLBACK_TEMPLATES[0];
    out = build(key);
  }
  if (out.length > 90) out = `${out.slice(0, 87).trim()}…`;
  if (out.length < 18) {
    const idx = hashPick(`${key}|${out}|seo-tagline`, FALLBACK_TEMPLATES.length);
    const build = FALLBACK_TEMPLATES[idx] || FALLBACK_TEMPLATES[0];
    out = build(key);
    if (out.length > 90) out = `${out.slice(0, 87).trim()}…`;
  }
  return out;
}

/** 제미나이 실패·키 없을 때 키워드별 변형 폴백 */
export function fallbackSiteTagline(keyword: string, seedExtra = ""): string {
  const key = String(keyword || "").trim() || "생활정보";
  const idx = hashPick(`${key}|${seedExtra}|seo-tagline`, FALLBACK_TEMPLATES.length);
  const build = FALLBACK_TEMPLATES[idx] || FALLBACK_TEMPLATES[0];
  return clampTagline(build(key), key);
}

export type GenerateSiteTaglineInput = {
  keyword: string;
  vendorName?: string;
  apiKey?: string;
  model?: string;
  seed?: string;
  /** true일 때만 제미나이 호출 (기본: 풀에서 선택) */
  useGemini?: boolean;
  designId?: string;
};

function extractJsonObject(text: string): string {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] || raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) return body.slice(start, end + 1);
  // 펜스만 있고 닫힘이 깨진 경우
  const loose = raw.match(/\{[\s\S]*"tagline"\s*:\s*"([^"\\]|\\.)*"[\s\S]*\}/);
  if (loose?.[0]) return loose[0];
  return body;
}

/** 네이버 등 검색 스니펫용 짧은 사이트 소개(사이트 태그라인) */
export async function generateSiteTagline(input: GenerateSiteTaglineInput): Promise<string> {
  const keyword = String(input.keyword || "").trim() || "생활정보";
  const vendorName = String(input.vendorName || "").trim();
  const seed = String(input.seed || "").trim() || `${keyword}|${vendorName}|${Date.now()}`;
  const apiKey = String(input.apiKey || "").trim();
  const useGemini = input.useGemini === true;
  if (!useGemini || !apiKey) {
    return pickPooledSiteIntro({
      keyword,
      vendorName,
      designId: input.designId,
      seed,
    });
  }

  const models = [
    String(input.model || "").trim(),
    "gemini-3.8-flash",
    DEFAULT_GEMINI_MODEL,
    "gemini-flash-latest",
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let lastErr: unknown;
  for (const modelName of models) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.95,
          maxOutputTokens: 1024,
        },
      });
      const prompt = `당신은 로컬 SEO 메타 디스크립션 카피라이터다.
검색 결과에서 사람들이 "들어가 봐야겠다"고 느끼게 할 짧은 한국어 소개 문장 1개만 써라.

키워드(사이트명): ${keyword}
업체명(있으면 참고만): ${vendorName || "(없음)"}
변형 시드(이 값마다 표현을 다르게): ${seed}

규칙:
- 45~85자 권장, 최대 90자.
- 키워드 주제를 자연히 담되, "모든 생활 정보를 한눈에" 같은 상투어 금지.
- 다른 지역·다른 키워드에 그대로 붙여도 되는 문장 금지.
- 과장 광고·이모지·해시태그·따옴표·제목 접두어 금지.
- "지금 예약" "최고" "1등" 같은 표현 금지.
- 코드펜스 없이 JSON만 출력: {"tagline":"..."}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text() || "";
      const jsonText = extractJsonObject(text);
      const parsed = JSON.parse(jsonText) as { tagline?: string };
      const out = clampTagline(String(parsed.tagline || ""), keyword);
      if (out && !isBlandSiteTagline(out)) return out;
    } catch (err) {
      lastErr = err;
      if (process.env.SITE_TAGLINE_DEBUG) {
        console.warn("[generateSiteTagline]", modelName, err instanceof Error ? err.message : err);
      }
    }
  }
  if (process.env.SITE_TAGLINE_DEBUG && lastErr) {
    console.warn("[generateSiteTagline] fallback", lastErr instanceof Error ? lastErr.message : lastErr);
  }
  return fallbackSiteTagline(keyword, seed);
}

export function resolveSiteTagline(
  settings?: { siteName?: string; siteTagline?: string } | null,
  siteFallbackTagline = "Curated Life & Trend"
) {
  const name = String(settings?.siteName || "").trim() || "매거진";
  const raw = String(settings?.siteTagline || "").trim();
  if (!isBlandSiteTagline(raw)) return raw;
  if (raw && raw !== "모든 생활 정보를 한눈에" && raw !== siteFallbackTagline) return raw;
  return fallbackSiteTagline(name, "resolve");
}
