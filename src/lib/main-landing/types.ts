export const MAIN_DESIGN_IDS = ["scalp-tattoo-v1", "demolition-v1"] as const;
export type MainDesignId = (typeof MAIN_DESIGN_IDS)[number];

export const LEGACY_MAIN_DESIGN_MAP: Record<string, MainDesignId> = {
  "brand-landing-v1": "scalp-tattoo-v1",
};

/** 최소 입력 + 레거시 호환 필드 */
export type MainLandingVendor = {
  /** 업체명 */
  name: string;
  /** 사이트이름(메인 SEO 키워드) */
  keyword: string;
  phone: string;
  address: string;
  /** 사업자등록번호 — 없으면 미노출 */
  businessNumber: string;
  kakao: string;
  /** 아래는 자동 유도·레거시 */
  industry: string;
  region: string;
  intro: string;
  website: string;
  strengths: string;
};

export type MainLandingImageSlots = {
  hero?: string;
  about?: string;
  gallery1?: string;
  gallery2?: string;
  gallery3?: string;
  contact?: string;
};

export type MainLandingPromise = { n: string; title: string; body: string };
export type MainLandingStep = { title: string; body: string };
export type MainLandingService = { title: string; body: string; tag?: string };
export type MainLandingDirectorGroup = { title: string; items: string[] };
export type MainLandingReview = { quote: string; name: string; course: string };
export type MainLandingStat = { value: string; label: string };
export type MainLandingGalleryCase = { title: string; tag: string };
export type MainLandingGrantBlock = {
  primary: string;
  secondary: string;
  headline: string;
  body: string;
  disclaimer: string;
};

/** Gemini「내용 보충」으로 채운 문장 오버라이드. 섹션 뼈대는 유지. */
export type MainLandingCopyOverride = {
  tagline?: string;
  heroKicker?: string;
  heroSubtitle?: string;
  heroLead?: string;
  heroHint?: string;
  aboutKicker?: string;
  aboutTitle?: string;
  aboutBody?: string;
  aboutPromises?: MainLandingPromise[];
  processKicker?: string;
  processTitle?: string;
  processLead?: string;
  processSteps?: MainLandingStep[];
  servicesKicker?: string;
  servicesTitle?: string;
  servicesLead?: string;
  services?: MainLandingService[];
  galleryKicker?: string;
  galleryTitle?: string;
  galleryLead?: string;
  directorKicker?: string;
  directorTitle?: string;
  directorLead?: string;
  directorGroups?: MainLandingDirectorGroup[];
  reviewsKicker?: string;
  reviewsTitle?: string;
  reviewsLead?: string;
  reviews?: MainLandingReview[];
  faqKicker?: string;
  faqTitle?: string;
  faqLead?: string;
  faqs?: { q: string; a: string }[];
  footerTagline?: string;
};

export type MainLandingConfig = {
  enabled: boolean;
  designId: MainDesignId;
  vendor: MainLandingVendor;
  imageFolderUrl: string;
  slots: MainLandingImageSlots;
  /** 추가요청사항 — 없으면 기본 원고만 사용 */
  prompt: string;
  variationSeed: string;
  /**
   * 브라우저·네이버 제목 뒷말.
   * 예: "필릭스스칼프 SMP 정수리탈모 가르마탈모"
   * → "청라두피문신 | 필릭스스칼프 SMP 정수리탈모 가르마탈모"
   */
  seoTitleSuffix: string;
  /** 있으면 템플릿 문장 대신 이 카피로 표시 */
  copyOverride?: MainLandingCopyOverride;
  /** 내용 보충 시각 (ISO) */
  enrichedAt?: string;
};

export type MainLandingResolvedImages = {
  hero: string;
  about: string;
  gallery: string[];
  contact: string;
};

export type MainLandingSectionId =
  | "hero"
  | "about"
  | "process"
  | "services"
  | "gallery"
  | "director"
  | "reviews"
  | "faq";

/** demolition-v1 본문 섹션 순서 (히어로·푸터 제외) */
export type DemolitionBlockId =
  | "reviews"
  | "about"
  | "process"
  | "gallery"
  | "services"
  | "grant"
  | "trust"
  | "cta"
  | "faq";

export type MainLandingTheme = {
  accent: string;
  teal: string;
  tealDeep: string;
  soft: string;
  bg: string;
};

export type MainLandingCopy = {
  brand: string;
  brandEn: string;
  tagline: string;
  heroKicker: string;
  heroTitle: string;
  heroSubtitle: string;
  heroLead: string;
  heroHint: string;
  aboutKicker: string;
  aboutTitle: string;
  aboutBody: string;
  aboutPromises: MainLandingPromise[];
  processKicker: string;
  processTitle: string;
  processLead: string;
  processSteps: MainLandingStep[];
  servicesKicker: string;
  servicesTitle: string;
  servicesLead: string;
  services: MainLandingService[];
  galleryKicker: string;
  galleryTitle: string;
  galleryLead: string;
  directorKicker: string;
  directorTitle: string;
  directorLead: string;
  directorGroups: MainLandingDirectorGroup[];
  reviewsKicker: string;
  reviewsTitle: string;
  reviewsLead: string;
  reviews: MainLandingReview[];
  faqKicker: string;
  faqTitle: string;
  faqLead: string;
  faqs: { q: string; a: string }[];
  ctaLabel: string;
  ctaPhone: string;
  ctaSecondary: string;
  footerTagline: string;
  /** 푸터·문의에 쓰는 확정 주소 (입력값 또는 자동생성) */
  displayAddress: string;
  theme: MainLandingTheme;
  /** @deprecated use theme.accent */
  accent: string;
  sectionOrder: MainLandingSectionId[];
  /** demolition-v1 전용 */
  grant?: MainLandingGrantBlock;
  stats?: MainLandingStat[];
  galleryCases?: MainLandingGalleryCase[];
  trustTitle?: string;
  trustBody?: string;
  /** demolition-v1: 키워드 시드별 섹션 배치 */
  demolitionBlockOrder?: DemolitionBlockId[];
  /** demolition-v1: 0–2 레이아웃 톤 (카드/컴팩트 등) */
  demolitionLayoutVariant?: number;
};

export function emptyMainLandingVendor(): MainLandingVendor {
  return {
    name: "",
    keyword: "",
    phone: "",
    address: "",
    businessNumber: "",
    kakao: "",
    industry: "",
    region: "",
    intro: "",
    website: "",
    strengths: "",
  };
}

export function defaultMainLandingConfig(): MainLandingConfig {
  return {
    enabled: false,
    designId: "scalp-tattoo-v1",
    vendor: emptyMainLandingVendor(),
    imageFolderUrl: "",
    slots: {},
    prompt: "",
    variationSeed: "",
    seoTitleSuffix: "",
    copyOverride: undefined,
    enrichedAt: "",
  };
}

export function isMainDesignId(value: unknown): value is MainDesignId {
  return MAIN_DESIGN_IDS.includes(String(value || "") as MainDesignId);
}

export function resolveMainDesignId(value: unknown): MainDesignId {
  const raw = String(value || "").trim();
  if (isMainDesignId(raw)) return raw;
  if (raw && LEGACY_MAIN_DESIGN_MAP[raw]) return LEGACY_MAIN_DESIGN_MAP[raw];
  return defaultMainLandingConfig().designId;
}
