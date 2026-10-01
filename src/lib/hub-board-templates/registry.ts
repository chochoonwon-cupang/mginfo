import { HUB_TEMPLATE_CATALOG } from "./catalog";
import { buildRegionalSeoTemplate } from "./builders/regional-seo";
import { HUB_TEMPLATE_COPIES } from "./copies";
import type { HubBoardTemplate } from "./types";
import type { TopicCopy } from "./topic-copy";

const FALLBACK_COPY: TopicCopy = {
  breedSummaryShort: "지역 기준으로 확인 포인트를 정리한 안내",
  breedIntroParagraphs: [
    "검색만으로 결정하기보다 조건·기록·진행 방식을 먼저 맞춰 보는 것이 안전합니다.",
    "지역 생활권과 일정, 예산, 사후 문의 가능 여부를 함께 보면 비교가 수월합니다.",
    "겉모습이나 단가만 보지 말고, 실제로 확인할 수 있는 자료를 우선하세요.",
  ],
  stats: {
    size: "상담 전 범위 확인",
    coat: "추가비·조건 확인",
    origin: "진행 절차 확인",
    homeNeed: "사후 문의 가능 여부",
  },
  step1Title: "진행 전 체크리스트",
  step1Lead: "바로 결정하기보다 아래 항목을 먼저 점검하세요.",
  step1Checks: ["예산과 일정", "필수 확인 자료", "현장·대면 가능 여부", "계약·약관", "사후 문의"],
  step2Title: "준비할 것",
  step2Body: ["필요한 준비물을 미리 정리하면 첫 상담이 짧아집니다.", "동선과 일정을 함께 맞춰 보세요."],
  step3Title: "안전한 진행 순서",
  step3Steps: ["문의", "자료 확인", "대면·현장", "조건 정리", "진행", "사후 확인"],
  step4Title: "확인할 포인트",
  step4Groups: [
    { heading: "기본", items: ["신원·연락 가능 여부", "설명의 일관성"] },
    { heading: "조건", items: ["비용 구성", "추가비 유무"] },
    { heading: "일정", items: ["가능 일정", "지연 시 안내"] },
    { heading: "사후", items: ["문의 채널", "보증·보장 범위"] },
  ],
  step5Title: "주의할 상황",
  step5Body: ["확인 없이 서두르는 결정은 피하세요.", "기록이 없거나 질문을 피하는 곳은 신중히 보세요."],
  careFlow: [
    { title: "상담", body: "조건과 일정을 맞춰 상담합니다." },
    { title: "확인", body: "자료와 현장을 확인합니다." },
    { title: "진행", body: "합의된 조건으로 진행합니다." },
    { title: "관리", body: "이후 필요한 관리 포인트를 안내받습니다." },
    { title: "문의", body: "사후 질문을 이어갈 수 있는지 확인합니다." },
  ],
  breedDetailParagraphs: [
    "주제별로 확인해야 할 핵심이 다릅니다. 지역과 생활 패턴에 대입해 보세요.",
    "비교할 때는 단가보다 설명의 투명성과 사후 대응을 우선하세요.",
    "최종 결정은 충분한 확인 뒤에 하는 편이 안전합니다.",
  ],
  healthRows: [
    { item: "기본 확인", guide: "필수 자료와 조건을 먼저 확인하세요." },
    { item: "위험 신호", guide: "설명과 자료가 맞지 않으면 보류하세요." },
    { item: "기록", guide: "합의 내용은 남겨 두는 것이 좋습니다." },
  ],
  careRows: [
    { item: "일정", guide: "가능 일정을 미리 조율하세요." },
    { item: "비용", guide: "포함·미포함 항목을 구분하세요." },
    { item: "문의", guide: "이후에도 연락 가능한지 확인하세요." },
  ],
  faq: [
    { question: "무엇을 먼저 보나요?", answer: "조건·기록·진행 방식을 먼저 보세요." },
    { question: "바로 결정해도 되나요?", answer: "충분한 확인 뒤에 결정하는 편이 안전합니다." },
    { question: "비용은요?", answer: "단가보다 포함 범위와 추가비를 확인하세요." },
    { question: "지역은요?", answer: "거주·방문 동선 기준으로 비교하면 좋습니다." },
    { question: "문의는요?", answer: "사후 문의 가능 여부를 미리 확인하세요." },
    { question: "주의점은요?", answer: "확인을 막는 진행은 피하세요." },
  ],
  closing: "기준을 세우고 천천히 비교하면 후회를 줄일 수 있습니다.",
};

function resolveCopy(id: string): TopicCopy {
  return HUB_TEMPLATE_COPIES[id] || FALLBACK_COPY;
}

const TEMPLATES: HubBoardTemplate[] = HUB_TEMPLATE_CATALOG.map((def) =>
  buildRegionalSeoTemplate(def, resolveCopy(def.id))
);

export function listHubBoardTemplates(): HubBoardTemplate[] {
  return TEMPLATES.slice().sort((a, b) => a.label.localeCompare(b.label, "ko"));
}

export function getHubBoardTemplate(id?: string | null): HubBoardTemplate | null {
  const key = String(id || "").trim() || defaultHubBoardTemplateId();
  return TEMPLATES.find((item) => item.id === key) || null;
}

export function defaultHubBoardTemplateId() {
  return TEMPLATES.some((row) => row.id === "goldendoodle-adoption")
    ? "goldendoodle-adoption"
    : TEMPLATES.slice().sort((a, b) => a.label.localeCompare(b.label, "ko"))[0]?.id || "goldendoodle-adoption";
}
