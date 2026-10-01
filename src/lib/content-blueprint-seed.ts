import type {
  ContentAngle,
  ContentBlock,
  ContentBlueprint,
  ContentBlueprintStore,
  Industry,
  PageType,
} from "./content-blueprint-types";

const NOW = "2026-09-18T00:00:00.000Z";

function industry(partial: Omit<Industry, "createdAt" | "updatedAt" | "status"> & { status?: Industry["status"] }): Industry {
  return { status: "active", createdAt: NOW, updatedAt: NOW, ...partial };
}

function block(
  partial: Omit<ContentBlock, "createdAt" | "updatedAt" | "status" | "version" | "optional" | "verifiedDataRequired" | "requiredData" | "allowedPageTypes"> &
    Partial<Pick<ContentBlock, "status" | "version" | "optional" | "verifiedDataRequired" | "requiredData" | "allowedPageTypes">>
): ContentBlock {
  return {
    allowedPageTypes: [],
    requiredData: [],
    verifiedDataRequired: false,
    optional: true,
    status: "active",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

function pageType(partial: Omit<PageType, "createdAt" | "updatedAt" | "status"> & { status?: PageType["status"] }): PageType {
  return { status: "active", createdAt: NOW, updatedAt: NOW, ...partial };
}

function angle(partial: Omit<ContentAngle, "createdAt" | "updatedAt" | "status"> & { status?: ContentAngle["status"] }): ContentAngle {
  return { status: "active", createdAt: NOW, updatedAt: NOW, ...partial };
}

function blueprint(
  partial: Omit<ContentBlueprint, "createdAt" | "updatedAt" | "status" | "version"> & {
    status?: ContentBlueprint["status"];
    version?: number;
  }
): ContentBlueprint {
  return { status: "active", version: 1, createdAt: NOW, updatedAt: NOW, ...partial };
}

const DOG_ID = "ind-dog-adoption";
const DEMO_ID = "ind-demolition";

const dogBlocks: ContentBlock[] = [
  block({
    id: "blk-dog-breed-intro",
    industryId: DOG_ID,
    key: "breed_intro",
    name: "견종 소개",
    description: "품종의 기본 배경과 이 글에서 다루는 범위를 안내한다.",
    allowedPageTypes: ["breed_guide", "local_service", "adoption_guide"],
  }),
  block({
    id: "blk-dog-temperament",
    industryId: DOG_ID,
    key: "temperament",
    name: "성격·기질",
    description: "함께 살 때 알아둘 성격 특징과 생활 리듬.",
    allowedPageTypes: ["breed_guide", "breed_management", "adoption_guide"],
  }),
  block({
    id: "blk-dog-appearance",
    industryId: DOG_ID,
    key: "appearance",
    name: "외모",
    description: "체형·모색·인상 등 외형 특징.",
    allowedPageTypes: ["breed_guide", "breed_management"],
  }),
  block({
    id: "blk-dog-adult-size",
    industryId: DOG_ID,
    key: "adult_size",
    name: "성견 크기",
    description: "성견 체중·키 범위와 공간 선택의 기준.",
    allowedPageTypes: ["breed_guide", "adoption_guide", "breed_management"],
  }),
  block({
    id: "blk-dog-living",
    industryId: DOG_ID,
    key: "living_environment",
    name: "생활환경",
    description: "아파트·마당·동선 등 생활 공간과의 적합성.",
    allowedPageTypes: ["breed_guide", "adoption_guide", "breed_management"],
  }),
  block({
    id: "blk-dog-grooming",
    industryId: DOG_ID,
    key: "grooming",
    name: "미용·털 관리",
    description: "빗질, 목욕, 미용 주기 등 관리 포인트.",
    allowedPageTypes: ["breed_guide", "breed_management"],
  }),
  block({
    id: "blk-dog-health",
    industryId: DOG_ID,
    key: "health_considerations",
    name: "건강 고려사항",
    description: "품종에서 자주 거론되는 건강 체크 포인트(일반 정보, 의료 진단 아님).",
    allowedPageTypes: ["breed_guide", "breed_management", "adoption_guide"],
  }),
  block({
    id: "blk-dog-first-owner",
    industryId: DOG_ID,
    key: "first_owner_guide",
    name: "초보 보호자 가이드",
    description: "처음 키울 때 준비할 것과 흔한 실수.",
    allowedPageTypes: ["adoption_guide", "breed_guide"],
  }),
  block({
    id: "blk-dog-checklist",
    industryId: DOG_ID,
    key: "adoption_checklist",
    name: "분양 전 체크리스트",
    description: "계약·건강·환경 확인 항목.",
    allowedPageTypes: ["adoption_guide", "local_service", "visit_guide"],
  }),
  block({
    id: "blk-dog-animals",
    industryId: DOG_ID,
    key: "available_animals",
    name: "실제 개체 안내",
    description: "검증된 개체 DB가 있을 때만 사용. 없으면 Planner가 생략.",
    verifiedDataRequired: true,
    requiredData: ["animals"],
    allowedPageTypes: ["local_service", "adoption_guide", "visit_guide"],
  }),
  block({
    id: "blk-dog-store",
    industryId: DOG_ID,
    key: "store_information",
    name: "매장·업체 정보",
    description: "상호·주소·연락처 등 검증된 업체 정보만.",
    verifiedDataRequired: true,
    requiredData: ["vendorName", "address", "phone"],
    allowedPageTypes: ["local_service", "visit_guide", "adoption_guide"],
  }),
  block({
    id: "blk-dog-visit",
    industryId: DOG_ID,
    key: "visit_information",
    name: "방문·상담 안내",
    description: "방문 전 준비, 상담 방식(검증된 영업시간·예약제 여부만).",
    verifiedDataRequired: true,
    requiredData: ["businessHours", "consultationMethod"],
    optional: true,
    allowedPageTypes: ["visit_guide", "local_service"],
  }),
  block({
    id: "blk-dog-faq",
    industryId: DOG_ID,
    key: "faq",
    name: "FAQ",
    description: "검색 의도에 맞는 질문·답변.",
    allowedPageTypes: ["breed_guide", "local_service", "adoption_guide", "breed_management", "visit_guide"],
  }),
];

const dogPageTypes: PageType[] = [
  pageType({
    id: "pt-dog-breed-guide",
    industryId: DOG_ID,
    key: "breed_guide",
    name: "견종 가이드",
    description: "품종 이해 중심 페이지.",
  }),
  pageType({
    id: "pt-dog-local-service",
    industryId: DOG_ID,
    key: "local_service",
    name: "지역 분양 서비스",
    description: "지역 + 분양 탐색 의도.",
  }),
  pageType({
    id: "pt-dog-adoption-guide",
    industryId: DOG_ID,
    key: "adoption_guide",
    name: "분양 가이드",
    description: "분양 결정·준비 중심.",
  }),
  pageType({
    id: "pt-dog-breed-mgmt",
    industryId: DOG_ID,
    key: "breed_management",
    name: "사육·관리",
    description: "관리·생활 팁 중심.",
  }),
  pageType({
    id: "pt-dog-visit",
    industryId: DOG_ID,
    key: "visit_guide",
    name: "방문 가이드",
    description: "매장 방문·상담 중심.",
  }),
];

const dogAngles: ContentAngle[] = [
  angle({ id: "ang-dog-beginner", industryId: DOG_ID, key: "beginner", name: "초보 보호자", description: "처음 알아보는 보호자 시선." }),
  angle({ id: "ang-dog-mgmt", industryId: DOG_ID, key: "management", name: "관리 중심", description: "털·건강·생활 관리." }),
  angle({ id: "ang-dog-appear", industryId: DOG_ID, key: "appearance", name: "외모 중심", description: "외형·이중모 등." }),
  angle({ id: "ang-dog-temp", industryId: DOG_ID, key: "temperament", name: "성격 중심", description: "기질·가족 생활." }),
  angle({ id: "ang-dog-family", industryId: DOG_ID, key: "family_lifestyle", name: "가족 생활", description: "아이·노인·다견 가정." }),
  angle({ id: "ang-dog-animal", industryId: DOG_ID, key: "real_animal", name: "실제 개체", description: "검증된 개체 정보가 있을 때." }),
  angle({ id: "ang-dog-visit", industryId: DOG_ID, key: "visit_consultation", name: "방문·상담", description: "방문 전후 안내." }),
];

const demoBlocks: ContentBlock[] = [
  block({
    id: "blk-demo-project-type",
    industryId: DEMO_ID,
    key: "project_type",
    name: "공사·현장 유형",
    description: "상가·주택·인테리어 철거 등 현장 유형.",
    allowedPageTypes: ["local_demolition", "process_guide", "estimate_guide"],
  }),
  block({
    id: "blk-demo-inspect",
    industryId: DEMO_ID,
    key: "site_inspection",
    name: "현장 실사",
    description: "실사에서 확인하는 항목.",
    allowedPageTypes: ["process_guide", "local_demolition", "visit_consult"],
  }),
  block({
    id: "blk-demo-scope",
    industryId: DEMO_ID,
    key: "demolition_scope",
    name: "철거 범위",
    description: "철거·해체 범위와 제외 항목.",
    allowedPageTypes: ["local_demolition", "process_guide", "estimate_guide"],
  }),
  block({
    id: "blk-demo-process",
    industryId: DEMO_ID,
    key: "work_process",
    name: "작업 과정",
    description: "착수부터 마무리까지의 단계.",
    allowedPageTypes: ["process_guide", "local_demolition"],
  }),
  block({
    id: "blk-demo-waste",
    industryId: DEMO_ID,
    key: "waste_disposal",
    name: "폐기물 처리",
    description: "반출·처리 일반 안내(업체 허가 사실은 verified만).",
    allowedPageTypes: ["process_guide", "estimate_guide"],
  }),
  block({
    id: "blk-demo-restore",
    industryId: DEMO_ID,
    key: "restoration",
    name: "원상복구",
    description: "복구·마감 범위.",
    allowedPageTypes: ["process_guide", "local_demolition"],
  }),
  block({
    id: "blk-demo-duration",
    industryId: DEMO_ID,
    key: "duration",
    name: "기간",
    description: "일정에 영향을 주는 요소(일반 기준).",
    allowedPageTypes: ["estimate_guide", "process_guide"],
  }),
  block({
    id: "blk-demo-price",
    industryId: DEMO_ID,
    key: "price_factors",
    name: "견적 결정 요소",
    description: "가격을 가르는 조건. 구체 견적 숫자는 verified만.",
    verifiedDataRequired: false,
    allowedPageTypes: ["estimate_guide", "local_demolition"],
  }),
  block({
    id: "blk-demo-safety",
    industryId: DEMO_ID,
    key: "safety",
    name: "안전",
    description: "안전·보양·주변 배려.",
    allowedPageTypes: ["process_guide", "local_demolition"],
  }),
  block({
    id: "blk-demo-examples",
    industryId: DEMO_ID,
    key: "project_examples",
    name: "현장 사례",
    description: "검증된 사례만. 없으면 생략.",
    verifiedDataRequired: true,
    requiredData: ["projectCases"],
    allowedPageTypes: ["local_demolition", "process_guide"],
  }),
  block({
    id: "blk-demo-company",
    industryId: DEMO_ID,
    key: "company_information",
    name: "업체 정보",
    description: "상호·연락처·주소 등 검증 정보.",
    verifiedDataRequired: true,
    requiredData: ["vendorName", "phone", "address"],
    allowedPageTypes: ["local_demolition", "visit_consult", "estimate_guide"],
  }),
  block({
    id: "blk-demo-consult",
    industryId: DEMO_ID,
    key: "consultation",
    name: "상담·견적 요청",
    description: "상담 절차(검증된 방식만).",
    verifiedDataRequired: true,
    requiredData: ["consultationMethod"],
    allowedPageTypes: ["visit_consult", "estimate_guide", "local_demolition"],
  }),
  block({
    id: "blk-demo-faq",
    industryId: DEMO_ID,
    key: "faq",
    name: "FAQ",
    description: "철거·견적·기간 관련 FAQ.",
    allowedPageTypes: ["local_demolition", "process_guide", "estimate_guide", "visit_consult"],
  }),
];

const demoPageTypes: PageType[] = [
  pageType({
    id: "pt-demo-local",
    industryId: DEMO_ID,
    key: "local_demolition",
    name: "지역 철거 서비스",
    description: "지역 + 철거 탐색.",
  }),
  pageType({
    id: "pt-demo-process",
    industryId: DEMO_ID,
    key: "process_guide",
    name: "공정 가이드",
    description: "작업 과정 중심.",
  }),
  pageType({
    id: "pt-demo-estimate",
    industryId: DEMO_ID,
    key: "estimate_guide",
    name: "견적 가이드",
    description: "비용·기간 요인 중심.",
  }),
  pageType({
    id: "pt-demo-visit",
    industryId: DEMO_ID,
    key: "visit_consult",
    name: "실사·상담",
    description: "현장 방문·상담 중심.",
  }),
];

const demoAngles: ContentAngle[] = [
  angle({ id: "ang-demo-process", industryId: DEMO_ID, key: "process_focused", name: "공정 중심", description: "작업 순서·범위." }),
  angle({ id: "ang-demo-cost", industryId: DEMO_ID, key: "cost_information_focused", name: "비용 정보", description: "견적 요인." }),
  angle({ id: "ang-demo-safety", industryId: DEMO_ID, key: "safety_focused", name: "안전 중심", description: "보양·안전." }),
  angle({ id: "ang-demo-case", industryId: DEMO_ID, key: "real_case_focused", name: "사례 중심", description: "검증 사례가 있을 때." }),
  angle({ id: "ang-demo-visit", industryId: DEMO_ID, key: "visit_focused", name: "실사·상담", description: "방문 전후." }),
  angle({ id: "ang-demo-problem", industryId: DEMO_ID, key: "problem_solution_focused", name: "문제 해결", description: "민원·폐기물 등 고민 해결." }),
];

export function seedContentBlueprintStore(): ContentBlueprintStore {
  return {
    industries: [
      industry({
        id: DOG_ID,
        key: "dog_adoption",
        name: "강아지분양",
        description: "견종·지역 분양 안내. Blueprint는 블록 풀이며 페이지 목차는 Planner가 정한다.",
        resolverHints: {
          keywords: [
            "분양",
            "강아지",
            "반려견",
            "애견",
            "포메",
            "포메라니안",
            "푸들",
            "말티",
            "말티푸",
            "비숑",
            "코커",
            "시바",
            "리트리버",
            "허스키",
            "치와와",
            "믹스견",
          ],
          aliases: ["반려견분양", "애견분양"],
          serviceTerms: ["분양", "입양상담"],
          negativeTerms: ["철거", "해체", "미용실", "동물병원진료"],
        },
      }),
      industry({
        id: DEMO_ID,
        key: "demolition",
        name: "철거",
        description: "상가·주택 등 철거 서비스. 강아지분양과 블록 체계가 완전히 다르다.",
        resolverHints: {
          keywords: ["철거", "해체", "원상복구", "폐기물처리", "인테리어철거", "상가철거", "주택철거", "사무실철거"],
          aliases: ["철거업체", "철거공사"],
          serviceTerms: ["철거", "해체", "원상복구"],
          negativeTerms: ["분양", "강아지", "반려견"],
        },
      }),
    ],
    blueprints: [
      blueprint({
        id: "bp-local-pet-adoption",
        industryId: DOG_ID,
        key: "local_pet_adoption",
        name: "지역 반려동물 분양 풀",
        description:
          "사용 가능한 콘텐츠 블록·페이지유형·앵글의 풀. 고정 목차 템플릿이 아니다. Planner가 키워드마다 블록을 고르고 순서를 정한다.",
        blockKeys: dogBlocks.map((b) => b.key),
        pageTypeKeys: dogPageTypes.map((p) => p.key),
        angleKeys: dogAngles.map((a) => a.key),
        version: 1,
      }),
      blueprint({
        id: "bp-local-demolition",
        industryId: DEMO_ID,
        key: "local_demolition_service",
        name: "지역 철거 서비스 풀",
        description:
          "철거 업종 전용 블록 풀. 분양 Blueprint와 섹션을 공유하지 않는다. 페이지 설계는 Planner 담당.",
        blockKeys: demoBlocks.map((b) => b.key),
        pageTypeKeys: demoPageTypes.map((p) => p.key),
        angleKeys: demoAngles.map((a) => a.key),
        version: 1,
      }),
    ],
    blocks: [...dogBlocks, ...demoBlocks],
    pageTypes: [...dogPageTypes, ...demoPageTypes],
    angles: [...dogAngles, ...demoAngles],
    overrides: [],
    updatedAt: NOW,
  };
}
