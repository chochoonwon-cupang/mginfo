export { resolveVendorAddress, autoAddressFromKeyword } from "./auto-address";
export { applyCopyOverride, parseCopyOverride } from "./copy-override";
export { SCALP_TATTOO_V1 } from "./designs/scalp-tattoo-v1";
export { DEMOLITION_V1 } from "./designs/demolition-v1";
export { enrichMainLandingCopy } from "./enrich";
export { resolveMainLandingImages, isMainLandingImageUrl } from "./images";
export { mainLandingEnabled, parseMainLandingConfig, buildMainLandingDocumentTitle } from "./parse";
export {
  MAIN_DESIGN_IDS,
  LEGACY_MAIN_DESIGN_MAP,
  defaultMainLandingConfig,
  emptyMainLandingVendor,
  isMainDesignId,
  resolveMainDesignId,
  type MainDesignId,
  type MainLandingConfig,
  type MainLandingCopy,
  type MainLandingCopyOverride,
  type MainLandingImageSlots,
  type MainLandingResolvedImages,
  type MainLandingSectionId,
  type MainLandingVendor,
  type DemolitionBlockId,
} from "./types";
export { buildMainLandingCopy, resolveVariationSeed } from "./vary";
export {
  buildMainLandingJsonLdGraph,
  buildMainLandingKeywords,
  buildMainLandingLocalBusinessJsonLd,
  buildMainLandingOpenGraphImages,
  buildMainLandingSeoDescription,
  pickMainLandingOgImage,
} from "./seo";
export const MAIN_DESIGNS = [
  {
    id: "scalp-tattoo-v1" as const,
    label: "두피문신",
    description: "필릭스스칼프형 (원장·후기·FAQ 포함, 문의폼 없음)",
  },
  {
    id: "demolition-v1" as const,
    label: "폐업·철거",
    description: "1977철거형 (후기·시공사례·지원금·FAQ, demolishzone 계열)",
  },
];
