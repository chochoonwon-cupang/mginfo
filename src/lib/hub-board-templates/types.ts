import type { FaqItem } from "../faq";

export type HubBoardTemplateVendor = {
  vendorName?: string;
  vendorPhone?: string;
  vendorWebsite?: string;
  vendorKakao?: string;
};

export type HubBoardTemplateBuildInput = {
  place: string;
  keyword: string;
  topic: string;
  vendor: HubBoardTemplateVendor;
  /** 0..N — same keyword/site retries pick another variant for uniqueness. */
  variant: number;
  nearby: string[];
  stations: string[];
  siteSeed?: string;
};

export type HubBoardTemplateDraft = {
  title: string;
  excerpt: string;
  bodyHtml: string;
  faqItems?: FaqItem[];
  regionInfo?: string;
  nearbyAreas?: string[];
  nearbyStations?: string[];
  slugHint?: string;
};

export type HubBoardTemplate = {
  id: string;
  label: string;
  topicLabel: string;
  build: (input: HubBoardTemplateBuildInput) => HubBoardTemplateDraft;
};
