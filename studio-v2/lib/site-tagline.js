const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

const FALLBACK_TEMPLATES = [
  (k) => `${k} 정보가 필요하면 시술·선택 전후로 꼭 볼 포인트만 짧게 모았습니다.`,
  (k) => `${k} 알아보는 중이라면, 비용·과정·주의점 기준으로 먼저 정리해 두었습니다.`,
  (k) => `${k} 검색하셨다면 상담 전에 확인할 핵심만 골랐습니다. 들어가서 바로 비교해 보세요.`,
  (k) => `${k} 고민이 있을 때 읽기 좋은 실무 가이드입니다. 과장 없이 체크리스트 중심으로.`,
  (k) => `${k} 관련 질문(효과·유지·후기 포인트)을 한곳에 모아 두었습니다.`,
  (k) => `${k} 알아보기 전, 놓치기 쉬운 기준과 방문 전 질문만 추렸습니다.`,
  (k) => `${k} 정보가 흩어져 있다면 여기서 먼저 흐름을 잡고 세부 글을 이어서 보세요.`,
  (k) => `${k} 선택 전 확인 포인트와 자주 묻는 답을 간결하게 담았습니다.`,
  (k) => `${k} 검색 결과를 줄이려면, 지역·시술 기준만 빠르게 훑어보세요.`,
  (k) => `${k} 관심이 생겼다면 비교에 쓰는 핵심 문장만 모아 두었습니다.`,
];

function hashPick(text, mod) {
  let h = 2166136261;
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % Math.max(1, mod);
}

function clampTagline(text, keyword) {
  let out = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^["'「『]|["'」』]$/g, "")
    .trim();
  out = out.replace(/^메타\s*설명\s*[:：]\s*/i, "").trim();
  if (!out) return fallbackSiteTagline(keyword);
  if (out.length > 90) out = `${out.slice(0, 87).trim()}…`;
  if (out.length < 18) return fallbackSiteTagline(keyword, out);
  return out;
}

function fallbackSiteTagline(keyword, seedExtra = "") {
  const key = String(keyword || "").trim() || "생활정보";
  const idx = hashPick(`${key}|${seedExtra}|seo-tagline`, FALLBACK_TEMPLATES.length);
  const build = FALLBACK_TEMPLATES[idx] || FALLBACK_TEMPLATES[0];
  return clampTagline(build(key), key);
}

function extractJson(text) {
  const fenced = String(text || "").match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] || text || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return raw;
}

const { pickPooledSiteIntro } = require("./site-intro-pool");

async function generateSiteTagline(input = {}) {
  const keyword = String(input.keyword || "").trim() || "생활정보";
  const vendorName = String(input.vendorName || "").trim();
  const seed = String(input.seed || "").trim() || `${keyword}|${vendorName}|${Date.now()}`;
  const apiKey = String(input.apiKey || "").trim();
  const model = String(input.model || "").trim() || DEFAULT_GEMINI_MODEL;
  const useGemini = input.useGemini === true;
  if (!useGemini || !apiKey) {
    return pickPooledSiteIntro({
      keyword,
      vendorName,
      designId: input.designId,
      seed,
    });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
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
- JSON만 출력: {"tagline":"..."}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.95, maxOutputTokens: 256 },
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error(`gemini ${res.status}`);
    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ||
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "";
    const parsed = JSON.parse(extractJson(text));
    return clampTagline(String(parsed.tagline || ""), keyword);
  } catch {
    return fallbackSiteTagline(keyword, seed);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cookieFromResponse(res) {
  if (typeof res.headers.getSetCookie === "function") {
    const list = res.headers.getSetCookie();
    if (list && list.length) return list.map((c) => String(c).split(";")[0]).join("; ");
  }
  const raw = res.headers.get("set-cookie");
  if (!raw) return "";
  return String(raw)
    .split(/,(?=\s*[A-Za-z0-9_\-]+=)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

const { sortStudioApiBases, studioAuthHeaders, mergeHeaders } = require("./http-client");

async function applySiteTagline(urls, payload, masterPassword, onLog = () => {}, opts = {}) {
  const bases = sortStudioApiBases(urls);
  const auth = studioAuthHeaders({ masterPassword, bypassSecret: opts.bypassSecret });
  const siteName = String(payload?.siteName || "").trim();
  const siteTagline = String(payload?.siteTagline || "").trim();
  if (!siteTagline || !bases.length) return false;

  const body = {
    siteName,
    siteTagline,
    enrich: false,
    ...(payload?.geminiApiKey ? { geminiApiKey: payload.geminiApiKey } : {}),
    ...(payload?.geminiModel ? { geminiModel: payload.geminiModel } : {}),
  };
  const secret = String(masterPassword || "").trim();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    for (const base of bases) {
      if (secret) {
        try {
          const res = await fetch(`${base}/api/brand-studio/bootstrap`, {
            method: "POST",
            headers: mergeHeaders({ "Content-Type": "application/json" }, auth),
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(60000),
          });
          if (res.ok) {
            onLog(`검색 소개문구 적용: ${siteTagline}`);
            return true;
          }
        } catch {
          /* retry */
        }
      }

      // 기존 클론(부트스트랩 미반영)도 관리자 설정 API로 바로 반영
      try {
        const login = await fetch(`${base}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "blog", password: "blog1234" }),
          signal: AbortSignal.timeout(20000),
        });
        if (login.ok) {
          const cookie = cookieFromResponse(login);
          const patch = await fetch(`${base}/api/settings`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(cookie ? { Cookie: cookie } : {}),
            },
            body: JSON.stringify({ siteName: siteName || undefined, siteTagline }),
            signal: AbortSignal.timeout(30000),
          });
          if (patch.ok) {
            onLog(`검색 소개문구 적용(설정): ${siteTagline}`);
            return true;
          }
        }
      } catch {
        /* retry */
      }
    }
    onLog(`검색 소개문구 적용 대기… (${attempt + 1}/8)`);
    await sleep(4000);
  }
  onLog("검색 소개문구 자동 적용에 실패했습니다. 관리자 > 설정에서 사이트 소개를 수정하세요.");
  return false;
}

module.exports = {
  DEFAULT_GEMINI_MODEL,
  fallbackSiteTagline,
  generateSiteTagline,
  applySiteTagline,
};
