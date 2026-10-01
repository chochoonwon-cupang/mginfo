export type TopicStatRow = {
  size: string;
  coat: string;
  origin: string;
  homeNeed: string;
};

export type TopicGuideRow = { item: string; guide: string };
export type TopicStepGroup = { heading: string; items: readonly string[] };
export type TopicCareFlow = { title: string; body: string };
export type TopicFaq = { question: string; answer: string };

/** Gemini 시드 본문 — 견종/묘종/일반 서비스 공통 스키마 */
export type TopicCopy = {
  breedSummaryShort: string;
  breedIntroParagraphs: readonly string[];
  stats: TopicStatRow;
  /** 통계 카드 라벨. 없으면 품종 기본 라벨 사용 */
  statLabels?: {
    size?: string;
    coat?: string;
    origin?: string;
    homeNeed?: string;
  };
  step1Title: string;
  step1Lead: string;
  step1Checks: readonly string[];
  step2Title: string;
  step2Body: readonly string[];
  step3Title: string;
  step3Steps: readonly string[];
  step4Title: string;
  step4Groups: readonly TopicStepGroup[];
  step5Title: string;
  step5Body: readonly string[];
  careFlow: readonly TopicCareFlow[];
  breedDetailParagraphs: readonly string[];
  healthRows: readonly TopicGuideRow[];
  careRows: readonly TopicGuideRow[];
  healthCaption?: string;
  careCaption?: string;
  detailHeading?: string;
  introHeading?: string;
  faq: readonly TopicFaq[];
  closing: string;
};

export type HubTemplateKind =
  | "breed-dog"
  | "breed-cat"
  | "dog-adoption"
  | "cat-adoption"
  | "dog-rehome"
  | "cat-rehome"
  | "dog-shelter"
  | "vet"
  | "vet-marketing"
  | "service";

export type HubTemplateDef = {
  id: string;
  label: string;
  topicLabel: string;
  kind: HubTemplateKind;
  /** SEO 핵심 키워드 (예: 골든두들분양) */
  seoKeyword: string;
  /** 제미나이 프롬프트 추가 지시 */
  promptExtra?: string;
};
