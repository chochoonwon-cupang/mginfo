import { fillDeep, type FelixTemplateVars } from "./felix-defaults";
import { buildFelixVars } from "./designs/scalp-tattoo-v1";
import type { MainLandingConfig, MainLandingCopy, MainLandingReview } from "./types";

function hasGeminiCopyOverride(config: MainLandingConfig): boolean {
  if (!config.enrichedAt) return false;
  const o = config.copyOverride;
  if (!o || typeof o !== "object") return false;
  return Object.keys(o).some((k) => {
    const v = (o as Record<string, unknown>)[k];
    if (Array.isArray(v)) return v.length > 0;
    return String(v || "").trim().length > 0;
  });
}

const DEMOLITION_HERO_LEADS = [
  "{{REGION}} {{KEYWORD}} 현장, 무료 방문 견적부터 원상복구·폐기물 처리까지 일정에 맞춰 진행합니다.",
  "{{KEYWORD}} 폐업·철거는 견적·계약·시공·정리까지 한 흐름으로 안내합니다. 야간·주말 협의 가능합니다.",
  "{{REGION}} 상가·음식점·사무실 철거, {{BRAND}}가 현장 실측 후 범위와 비용을 투명하게 제안합니다.",
  "급한 폐업 일정도 {{KEYWORD}} 전담 상담으로 견적·지원금·철거 범위를 먼저 맞춘 뒤 착수합니다.",
  "{{REGION}} {{KEYWORD}} 원상복구 기준, 건물주·임대차 조건에 맞춰 분쟁 없이 마무리하도록 돕습니다.",
];

const DEMOLITION_ABOUT_BODIES = [
  "{{REGION}} {{KEYWORD}}는 무허가·저가 미끼 견적 피해가 잦습니다. 계약서·면허·보험 확인 후 착수합니다.",
  "{{KEYWORD}} 현장은 폐기물 분리·인허가·소음 민원까지 포함해 일정표를 먼저 공유합니다.",
  "{{BRAND}} {{REGION}} 팀은 상가·주방·인테리어 철거 경험을 바탕으로 범위를 나눠 견적합니다.",
  "지원금·폐업 컨설ting과 철거를 함께 진행해, {{REGION}} {{KEYWORD}} 고객 비용 부담을 줄입니다.",
];

const DEMOLITION_TRUST_BODIES = [
  "철거 업체 사기 피해가 늘고 있습니다. {{KEYWORD}}는 지원금 상담부터 철거·원상복구까지 문서와 일정을 남깁니다.",
  "{{REGION}} {{KEYWORD}} 고객에게 견적서·공사 전후 사진·폐기물 처리 내역을 투명하게 제공합니다.",
  "{{BRAND}}는 {{REGION}} 현장 조건에 맞는 철거 범위만 제안하고, 추가 비용은 사전 동의 후 진행합니다.",
];

const DEMOLITION_REVIEW_POOL: MainLandingReview[] = [
  { quote: "폐업 일정이 촉박했는데 방문 견적 후 바로 일정 잡아 일정 내에 끝냈습니다.", name: "백*진", course: "브런치 카페 · {{REGION}}" },
  { quote: "지원금 활용이 가능한지 몰랐는데 상담부터 서류까지 챙겨 주셔서 부담 없이 마무리했습니다.", name: "문*화", course: "뷰티샵 · {{REGION}}" },
  { quote: "주방 설비 철거가 까다로웠는데 일정과 비용을 투명하게 안내해 주셔서 믿고 맡겼습니다.", name: "최*영", course: "음식점 · {{REGION}}" },
  { quote: "야간 작업이 필요했는데 민원 없이 조용히 마무리해 주변 상가와도 문제 없었습니다.", name: "정*수", course: "사무실 · {{REGION}}" },
  { quote: "임대차 원상복구 기준이 까다로웠는데 건물주와 조율해 분쟁 없이 계약 종료했습니다.", name: "박*길", course: "IT 스타트업 · {{REGION}}" },
  { quote: "운동기구가 많아 난이도가 높았는데 경험 있는 팀이 빠르게 처리했습니다.", name: "김*덕", course: "피트니스 · {{REGION}}" },
  { quote: "{{REGION}} 소형 상가였는데도 폐기물까지 깔끔히 치워 주셔서 다음 날 인계가 수월했습니다.", name: "이*아", course: "소매 매장 · {{REGION}}" },
  { quote: "견적 비교 후 선택했는데 숨은 비용 없이 계약대로 진행돼 만족합니다.", name: "한*우", course: "프랜차이즈 · {{REGION}}" },
  { quote: "사진만으로 1차 견적 받고 현장에서 확정했습니다. 설명이 차분해서 좋았습니다.", name: "오*린", course: "카페 · {{REGION}}" },
  { quote: "원상복구 범위를 글·사진으로 남겨 주셔서 건물주 확인이 빨랐습니다.", name: "윤*석", course: "학원 · {{REGION}}" },
  { quote: "폐업 지원금 상담과 철거 일정을 같이 맞춰 줘서 한 번에 정리됐습니다.", name: "장*희", course: "네일샵 · {{REGION}}" },
  { quote: "철거 후 바닥·벽 마감 상태까지 체크해 주셔서 다음 입점 준비가 편했습니다.", name: "신*준", course: "의류 매장 · {{REGION}}" },
];

const SCALP_HERO_LEADS = [
  "{{PLACE}} {{KEYWORD}} 두피문신(SMP), 밀도·라인 디자인 상담 후 맞춤 시술을 진행합니다.",
  "{{REGION}} {{KEYWORD}} 스튜디오, 정수리·헤어라인 고민을 1:1 상담으로 먼저 정리합니다.",
  "{{BRAND}} {{PLACE}} — 시술·관리 포인트를 투명하게 안내한 뒤 SMP 계획을 잡습니다.",
];

const SCALP_REVIEW_POOL: MainLandingReview[] = [
  { quote: "디자인 상담이 길었지만 그만큼 결과가 자연스럽습니다.", name: "김*수", course: "{{REGION}} · 정수리" },
  { quote: "시술 후 관리 방법까지 알려 주셔서 불안이 줄었습니다.", name: "이*정", course: "{{REGION}} · 가르마" },
  { quote: "가격보다 라인·밀도 설명이 자세해서 선택했습니다.", name: "박*민", course: "{{PLACE}} · SMP" },
  { quote: "재시술 가능 여부를 솔직히 말해 줘서 신뢰가 갔습니다.", name: "최*영", course: "{{REGION}} · 두피" },
  { quote: "예약·상담 응대가 차분해서 첫 방문이 편했습니다.", name: "정*아", course: "{{KEYWORD}}" },
  { quote: "전후 사진 기준으로 설명해 주셔서 기대치 맞추기 좋았습니다.", name: "한*별", course: "{{REGION}} · SMP" },
];

function shufflePick<T>(items: T[], count: number, rand: () => number): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

function fillReview(r: MainLandingReview, vars: FelixTemplateVars): MainLandingReview {
  const filled = fillDeep(r, vars);
  return { quote: filled.quote, name: filled.name, course: filled.course };
}

/** 제미나이 enrich 없을 때 메인 카피를 풀에서 키워드·시드별로 조합 */
export function applyPooledMainLandingCopy(
  copy: MainLandingCopy,
  config: MainLandingConfig,
  siteName: string,
  rand: () => number
): MainLandingCopy {
  if (hasGeminiCopyOverride(config)) return copy;

  const vars = buildFelixVars(config.vendor, siteName);
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)] || arr[0];

  if (config.designId === "demolition-v1") {
    const reviews = shufflePick(DEMOLITION_REVIEW_POOL, 6, rand).map((r) => fillReview(r, vars));
    return {
      ...copy,
      heroLead: fillDeep(pick(DEMOLITION_HERO_LEADS), vars),
      aboutBody: fillDeep(pick(DEMOLITION_ABOUT_BODIES), vars),
      trustBody: fillDeep(pick(DEMOLITION_TRUST_BODIES), vars),
      reviews,
    };
  }

  const reviews = shufflePick(SCALP_REVIEW_POOL, Math.min(4, copy.reviews.length || 4), rand).map((r) =>
    fillReview(r, vars)
  );
  return {
    ...copy,
    heroLead: fillDeep(pick(SCALP_HERO_LEADS), vars),
    reviews: reviews.length ? reviews : copy.reviews,
  };
}
