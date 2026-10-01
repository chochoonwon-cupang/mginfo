import { fillDeep, type FelixTemplateVars } from "../felix-defaults";
import { buildFelixVars, inferRegion } from "./scalp-tattoo-v1";
import type { MainLandingCopy, MainLandingVendor } from "../types";

export const DEMOLITION_V1 = {
  id: "demolition-v1" as const,
  label: "폐업·철거",
  description: "폐업철거형 — 후기·강점·절차·시공사례·지원금·FAQ",
};

/** demolishzone.yourdogzone.co.kr 계열 레이아웃에 맞춘 기본 원고 */
export const DEMOLITION_V1_DEFAULT = {
  brandEn: "DEMOLISH PRO",
  tagline: "{{REGION}} 폐업·상가철거 · 원상복구 · 폐업지원금 상담",
  heroKicker: "믿을 수 있는 철거 파트너",
  heroTitle: "{{KEYWORD}}",
  heroSubtitle: "{{KEYWORD}} · {{REGION}}",
  heroLead:
    "무료 방문 견적부터 원상복구까지 {{REGION}} {{KEYWORD}} 현장을 책임집니다. 폐업 일정에 맞춘 야간·주말 시공 협의가 가능합니다.",
  heroHint: "전화 문의로 빠르게 일정과 비용을 안내해 드립니다.",
  aboutKicker: "만족도 95%",
  aboutTitle: "{{KEYWORD}}가\n현장 만족도가 높은 이유",
  aboutBody:
    "{{REGION}} {{KEYWORD}} 철거는 견적·일정·폐기물 처리까지 한 번에 맞춥니다. 무허가 업체 피해를 줄이기 위해 계약서·면허·보험을 먼저 확인합니다.",
  aboutPromises: [
    { n: "01", title: "무료 방문 견적", body: "당일 가능 · 전국 출장" },
    { n: "02", title: "일정 맞춤 시공", body: "야간·주말 · 협의 가능" },
    { n: "03", title: "원상복구 대응", body: "건물주 협의 · 분쟁 예방" },
  ],
  processKicker: "PROCESS",
  processTitle: "빠르고 정확한\n철거 과정",
  processLead: "철거의 시작과 끝을 책임지고 도와드립니다.",
  processSteps: [
    { title: "온라인·전화 상담", body: "업종·평수·일정을 먼저 파악합니다." },
    { title: "현장 실측·견적", body: "사진·동영상으로도 사전 견적이 가능합니다." },
    { title: "철거·정리·복구", body: "공사 후 폐기물까지 마무리합니다." },
  ],
  servicesKicker: "SERVICE",
  servicesTitle: "철거·원상복구\n서비스 범위",
  servicesLead: "{{REGION}} 상가·음식점·사무실·의료시설 등 업종별 맞춤 진행",
  services: [
    { title: "폐업·상가 철거", body: "주방·인테리어·집기 일괄 해체", tag: "철거" },
    { title: "원상복구", body: "임대차 기준 협의 · 건물주 조율", tag: "복구" },
    { title: "폐기물 처리", body: "분리 배출 · 허가 업체 연계", tag: "폐기물" },
  ],
  galleryKicker: "WORKS",
  galleryTitle: "{{KEYWORD}} 시공 사례",
  galleryLead: "실제 현장 철거·원상복구 사례를 확인해 보세요.",
  directorKicker: "SUPPORT",
  directorTitle: "폐업지원금 · 추가 지원\n상담 안내",
  directorLead: "현장 조건에 맞는 지원금 활용 방안을 상담한 뒤 철거 범위를 제안합니다.",
  directorGroups: [
    {
      title: "지원·실적",
      items: [
        "폐업지원금 600만원 + 추가 지원 400만원 (조건 상이)",
        "누적 상담 4,200+ · 월 평균 시공 85+건",
        "무료 방문 견적 100% · 지원금 수급 성공률 96%",
      ],
    },
  ],
  reviewsKicker: "REVIEW",
  reviewsTitle: "실제 이용 고객\n만족 후기",
  reviewsLead: "폐업·철거를 경험하신 분들의 후기입니다.",
  reviews: [
    {
      quote: "폐업 일정이 촉박했는데 현장 방문 견적 후 바로 일정 잡아주셔서 일정 내에 끝냈습니다.",
      name: "백*진",
      course: "브런치 카페 폐업",
    },
    {
      quote: "지원금 활용이 가능한지 몰랐는데, 상담부터 서류까지 꼼꼼히 챙겨주셔서 비용 부담 없이 마무리했습니다.",
      name: "문*화",
      course: "뷰티샵 폐업",
    },
    {
      quote: "주방 설비 철거가 까다로웠는데 일정과 비용 모두 투명하게 안내해 주셔서 믿고 맡겼습니다.",
      name: "최*영",
      course: "음식점 폐업",
    },
    {
      quote: "야간 작업이 필요했는데 민원 없이 조용히 마무리해 주셔서 주변 상가와도 문제가 없었습니다.",
      name: "정*수",
      course: "사무실 이전",
    },
    {
      quote: "임대차 원상복구 기준이 까다로웠는데, 건물주와 직접 조율해 주셔서 분쟁 없이 계약 종료했습니다.",
      name: "박*길",
      course: "IT스타트업 폐업",
    },
    {
      quote: "운동기구가 많아 난이도가 높았는데, 경험 있는 팀이 와서 빠르게 처리했습니다.",
      name: "김*덕",
      course: "피트니스센터 폐업",
    },
  ],
  faqKicker: "FAQ",
  faqTitle: "자주 묻는 질문",
  faqLead: "{{KEYWORD}} · {{REGION}} 철거 상담 전 확인해 보세요.",
  faqs: [
    {
      q: "견적은 어떻게 받나요?",
      a: "전화 상담 후 현장 방문 실측으로 확정 견적을 드립니다.",
    },
    {
      q: "폐업지원금도 도와주나요?",
      a: "조건에 따라 지원금 신청 절차를 안내하고, 철거 범위와 함께 상담합니다.",
    },
    {
      q: "야간·주말 시공이 가능한가요?",
      a: "민원·건물 규정 범위 내에서 일정 협의가 가능합니다.",
    },
  ],
  ctaLabel: "자주 묻는 질문",
  ctaPhone: "전화 상담",
  ctaSecondary: "시공 사례 보기",
  footerTagline: "{{BRAND}} · {{REGION}} 폐업철거 · 원상복구",
  displayAddress: "{{ADDRESS}}",
  trustTitle: "전국 폐업철거 파트너 {{KEYWORD}}",
  trustBody:
    "철거 업체 사기 피해 사례가 늘고 있습니다. {{KEYWORD}}는 지원금 신청부터 철거·원상복구까지 책임지고 진행합니다.",
  grantPrimary: "폐업지원금 600만원",
  grantSecondary: "+ 추가 지원 400만원",
  grantHeadline: "합산 최대 1000만원 상담",
  grantBody:
    "현장 조건에 맞는 지원금 활용 방안을 먼저 상담한 뒤 철거 범위를 제안합니다.",
  grantDisclaimer:
    "*지역·업종·평수에 따라 지원 금액이 달라질 수 있습니다. 시공 전 상담을 권장합니다.",
  stats: [
    { value: "4,200+", label: "누적 상담 건수" },
    { value: "85+건", label: "월 평균 시공" },
    { value: "100%", label: "무료 방문 견적" },
    { value: "96%", label: "지원금 수급 성공률" },
  ],
  galleryCases: [
    { title: "{{KEYWORD}} 사무실 인테리어 철거", tag: "철거·원상복구" },
    { title: "{{KEYWORD}} 음식점 인테리어 철거", tag: "철거" },
    { title: "{{KEYWORD}} 대형매장 폐기물 수거", tag: "폐기물처리" },
    { title: "{{KEYWORD}} 프랜차이즈 매장 철거", tag: "철거·원상복구" },
    { title: "{{KEYWORD}} 식당 주방 철거", tag: "철거·원상복구" },
    { title: "{{KEYWORD}} 상가 내부 철거", tag: "철거·원상복구" },
    { title: "{{KEYWORD}} 의료시설 인테리어 철거", tag: "철거·원상복구" },
    { title: "{{KEYWORD}} 소형 배달주방 철거", tag: "철거·원상복구" },
  ],
};

export function buildDemolitionV1Base(
  vendor: MainLandingVendor,
  siteName: string
): Omit<MainLandingCopy, "accent" | "theme" | "sectionOrder"> {
  const vars: FelixTemplateVars = buildFelixVars(vendor, siteName);
  if (!vars.region || vars.region === "스튜디오") {
    vars.region = inferRegion(vendor);
  }
  const filled = fillDeep(DEMOLITION_V1_DEFAULT, vars);
  return {
    brand: vars.brand,
    brandEn: filled.brandEn,
    tagline: filled.tagline,
    heroKicker: filled.heroKicker,
    heroTitle: filled.heroTitle,
    heroSubtitle: filled.heroSubtitle,
    heroLead: filled.heroLead,
    heroHint: filled.heroHint,
    aboutKicker: filled.aboutKicker,
    aboutTitle: filled.aboutTitle,
    aboutBody: filled.aboutBody,
    aboutPromises: [...filled.aboutPromises],
    processKicker: filled.processKicker,
    processTitle: filled.processTitle,
    processLead: filled.processLead,
    processSteps: [...filled.processSteps],
    servicesKicker: filled.servicesKicker,
    servicesTitle: filled.servicesTitle,
    servicesLead: filled.servicesLead,
    services: [...filled.services],
    galleryKicker: filled.galleryKicker,
    galleryTitle: filled.galleryTitle,
    galleryLead: filled.galleryLead,
    directorKicker: filled.directorKicker,
    directorTitle: filled.directorTitle,
    directorLead: filled.directorLead,
    directorGroups: [...filled.directorGroups],
    reviewsKicker: filled.reviewsKicker,
    reviewsTitle: filled.reviewsTitle,
    reviewsLead: filled.reviewsLead,
    reviews: [...filled.reviews],
    faqKicker: filled.faqKicker,
    faqTitle: filled.faqTitle,
    faqLead: filled.faqLead,
    faqs: [...filled.faqs],
    ctaLabel: filled.ctaLabel,
    ctaPhone: filled.ctaPhone,
    ctaSecondary: filled.ctaSecondary,
    footerTagline: filled.footerTagline,
    displayAddress: vars.address,
    trustTitle: filled.trustTitle,
    trustBody: filled.trustBody,
    grant: {
      primary: filled.grantPrimary,
      secondary: filled.grantSecondary,
      headline: filled.grantHeadline,
      body: filled.grantBody,
      disclaimer: filled.grantDisclaimer,
    },
    stats: [...filled.stats],
    galleryCases: filled.galleryCases.map((c: { title: string; tag: string }) => ({
      title: c.title,
      tag: c.tag,
    })),
  };
}
