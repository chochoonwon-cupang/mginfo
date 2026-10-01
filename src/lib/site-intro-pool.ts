import { inferRegion } from "./main-landing/designs/scalp-tattoo-v1";
import { emptyMainLandingVendor, type MainDesignId } from "./main-landing/types";

function hashPick(text: string, mod: number) {
  let h = 2166136261;
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % Math.max(1, mod);
}

function clamp(text: string, keyword: string): string {
  let out = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (out.length > 90) out = `${out.slice(0, 87).trim()}…`;
  if (out.length < 24) return `${keyword} 현장 맞춤 안내 · 무료 상담과 견적을 확인하세요.`;
  return out;
}

/** 네이버 스니펫용 — 클릭·신뢰 유도, 키워드·업체 조합 */
const DEMOLITION_INTROS = [
  (k: string, r: string, b: string) =>
    `${k} 폐업·철거, ${r} 현장 무료 견적·지원금 상담. ${b}가 일정·원상복구까지 투명히 안내합니다.`,
  (k: string, r: string) =>
    `${r} ${k} 상가·주방 철거, 계약 전 범위·비용·폐기물 처리까지 한 번에 정리해 드립니다.`,
  (k: string, _r: string, b: string) =>
    `${k} 급한 폐업 일정도 ${b} 전담 상담으로 견적·지원금·철거 범위를 먼저 맞춥니다.`,
  (k: string, r: string) =>
    `${r} ${k} 원상복구·철거, 무허가 업체 피해 줄이려면 견적서·면허 확인 후 착수하세요.`,
  (k: string, r: string, b: string) =>
    `${k} ${r} 현장, ${b} — 방문 실측·야간 협의·폐기물 마무리까지 실제 후기 기준으로 안내합니다.`,
  (k: string, r: string) =>
    `${r} ${k} 폐업 준비 중이시면 지원금 활용과 철거 일정을 함께 상담해 보세요.`,
  (k: string, _r: string, b: string) =>
    `${k} 철거·원상복구, ${b} 무료 방문 견적과 지원금 서류 안내로 비용 부담을 줄입니다.`,
  (k: string, r: string) =>
    `${r} ${k} 인테리어·집기 철거, 추가 비용 없이 계약 범위를 먼저 문서로 공유합니다.`,
  (k: string, r: string, b: string) =>
    `${k} | ${r} ${b} — 상가·음식점·사무실 철거 후기와 진행 절차를 확인하세요.`,
  (k: string, r: string) =>
    `${r} ${k} 검색 중이시면 무료 견적·폐업지원금·원상복구 기준을 이 페이지에서 먼저 보세요.`,
];

const SCALP_INTROS = [
  (k: string, r: string, b: string) =>
    `${k} ${r} 두피문신(SMP), ${b} 1:1 디자인 상담 후 밀도·라인 맞춤 시술을 안내합니다.`,
  (k: string, r: string) =>
    `${r} ${k} 정수리·헤어라인 고민, 시술 전후·관리 포인트를 짧게 정리해 두었습니다.`,
  (k: string, _r: string, b: string) =>
    `${k} 알아보신다면 ${b} 상담 흐름·비용 기준·주의사항을 먼저 확인해 보세요.`,
  (k: string, r: string) =>
    `${r} ${k} SMP, 과장 없는 전후 기준과 상담 체크리스트 중심으로 안내합니다.`,
];

export type PickPooledSiteIntroInput = {
  keyword: string;
  vendorName?: string;
  designId?: MainDesignId | string;
  seed?: string;
};

export function pickPooledSiteIntro(input: PickPooledSiteIntroInput): string {
  const keyword = String(input.keyword || "").trim() || "지역 서비스";
  const vendorName = String(input.vendorName || "").trim();
  const brand = vendorName || keyword;
  const region = inferRegion({ ...emptyMainLandingVendor(), keyword, name: brand });
  const regionLabel = region && region !== "스튜디오" ? region : keyword.replace(/철거|폐업|두피문신|SMP/gi, "").trim() || "지역";
  const designId = String(input.designId || "scalp-tattoo-v1");
  const pool = designId === "demolition-v1" ? DEMOLITION_INTROS : SCALP_INTROS;
  const seed = String(input.seed || `${keyword}|${brand}|${designId}`);
  const idx = hashPick(`${seed}|intro-pool`, pool.length);
  const build = pool[idx] || pool[0];
  return clamp(build(keyword, regionLabel, brand), keyword);
}
