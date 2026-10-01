import type { MainLandingConfig } from "./main-landing/types";
import type { HubPortalConfig } from "./hub-portal/types";

/** Per-domain home/main landing (multi-tenant single Vercel project). */
export type HostSiteProfile = {
  siteName?: string;
  siteTagline?: string;
  company?: string;
  phone?: string;
  address?: string;
  bizNo?: string;
  naverSiteVerification?: string;
  vendorGroupId?: string;
  mainLanding: MainLandingConfig;
  updatedAt?: string;
};

export type CategorySlug = string;

export type CategoryVendorMode = "all" | "region";

export type CategoryVendorAd = {
  vendorId: string;
  mode: CategoryVendorMode;
  regions?: string[];
  excludes?: string[];
};

export type Category = {
  slug: string;
  name: string;
  color: string;
  filterClass: string;
  geminiNotes?: string;
  vendorSlotCount?: number;
  vendorAds?: CategoryVendorAd[];
  vendorRecruitSlot?: boolean;
};

export type PostStatus = "draft" | "published";

/** direct = blog-style authored HTML; ai = pipeline magazine layout. Missing = legacy magazine. */
export type PublishMode = "direct" | "ai";

export type FaqItem = {
  question: string;
  answer: string;
};

export type PostImage = {
  url: string;
  caption?: string;
};

export type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  bodyHtml: string;
  category: CategorySlug;
  tags: string[];
  coverImage?: string;
  coverCaption?: string;
  extraImages?: PostImage[];
  focusKeyword?: string;
  faqItems?: FaqItem[];
  regionInfo?: string;
  nearbyAreas?: string[];
  nearbyStations?: string[];
  status: PostStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** How the post was authored. Affects public detail rendering. */
  publishMode?: PublishMode;
  theme?: string;
  region?: string;
  vendorName?: string;
  vendorPhone?: string;
  vendorWebsite?: string;
  vendorKakao?: string;
  vendorPlaceUrl?: string;
  vendorId?: string;
  vendorIds?: string[];
  youtubeUrl1?: string;
  youtubeUrl2?: string;
  vendorBizNo?: string;
  vendorAddress?: string;
  hubCampaignId?: string;
  vendorRecruitSlot?: boolean;
  hubVendorRegisterUrl?: string;
  /** PHASE 1+ content architecture (optional — old posts omit these). */
  industryId?: string;
  blueprintId?: string;
  blueprintVersion?: number;
  pageType?: string;
  contentAngle?: string;
  pagePlanId?: string;
  generationVersion?: string;
  /** planner_writer_v1 | legacy | legacy_fallback */
  generationMode?: string;
  /** Compact generation diagnostics for A/B and cost review. */
  generationLog?: import("./page-plan-types").GenerationLog;
};

export type AdminPostRow = {
  id: string;
  slug: string;
  title: string;
  category: CategorySlug;
  status: PostStatus;
  publishedAt: string | null;
  createdAt: string;
};

export type Partner = {
  id: string;
  name: string;
  category: string;
  intro: string;
  url?: string;
  phone?: string;
  imageUrl?: string;
};

export type AdVendor = {
  id: string;
  name: string;
  category?: string;
  intro?: string;
  phone?: string;
  website?: string;
  kakao?: string;
  notes?: string;
  imageUrl?: string;
  youtubeUrl1?: string;
  youtubeUrl2?: string;
  bizNo?: string;
  address?: string;
  createdAt: string;
  updatedAt: string;
};

export type BannerKind = "text" | "image";

export type BannerTheme = "bronze" | "ink" | "ivory" | "forest" | "wine";

export type Banner = {
  id: string;
  kind: BannerKind;
  enabled: boolean;
  href: string;
  theme: BannerTheme;
  kicker?: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type SiteThemeId =
  | "folio"
  | "press"
  | "night"
  | "journal"
  | "qna"
  | "talk"
  | "portal"
  | "carrot"
  | "studio";

export type Settings = {
  geminiApiKey: string;
  geminiModel: string;
  siteName: string;
  siteTagline: string;
  siteTheme: SiteThemeId;
  carrotKeywords: string;
  popupEnabled: boolean;
  popupTitle: string;
  popupBody: string;
  popupCta: string;
  popupHref: string;
  popupImage: string;
  likeCountMin: number;
  likeCountMax: number;
  commentCountMin: number;
  commentCountMax: number;
  /** Site footer short disclaimer — unique per clone when empty (picked from variants). */
  footerDisclaimer: string;
  usableUntil: string;
  dailyPostLimit: number;
  naverRankWork: boolean;
  naverSiteVerification: string;
  extraImagesEnabled: boolean;
  vendorRegisterUrl: string;
  writingTone: string;
  writingPersona: string;
  siteUsername: string;
  sitePassword: string;
  company: string;
  ceo: string;
  bizNo: string;
  address: string;
  phone: string;
  email: string;
  publishBannedKeywords?: string[];
  staffNoticeEnabled?: boolean;
  staffNoticeTitle?: string;
  staffNoticeBody?: string;
  staffNoticeUpdatedAt?: string;
  /** Brand main landing (default off — existing magazine home unchanged). */
  mainLanding?: MainLandingConfig;
  /** Hub-only clone aggregator portal home (default off). */
  hubPortal?: HubPortalConfig;
};

export type BulkKeywordStatus = "queued" | "scheduled" | "processing" | "published" | "failed";

export type BulkKeyword = {
  id: string;
  keyword: string;
  status: BulkKeywordStatus;
  postId?: string;
  scheduledAt?: string;
  publishedAt?: string;
  processingAt?: string;
  processingClaim?: string;
  error?: string;
  youtubeUrl1?: string;
  youtubeUrl2?: string;
};

export type BulkGroup = {
  id: string;
  category: CategorySlug;
  dailyLimit: number;
  vendorName?: string;
  vendorPhone?: string;
  vendorWebsite?: string;
  vendorKakao?: string;
  vendorPlaceUrl?: string;
  vendorId?: string;
  vendorIds?: string[];
  youtubeUrl1?: string;
  youtubeUrl2?: string;
  writingStyle?: string;
  extraPrompt?: string;
  imagePool?: string[];
  imageCountMin?: number;
  imageCountMax?: number;
  imageCount?: number;
  /** Optional hub Industry / Blueprint pin for Planner path. */
  industryId?: string;
  blueprintId?: string;
  keywords: BulkKeyword[];
};

export type BulkSchedule = {
  enabled: boolean;
  startHour: number;
  endHour: number;
  planDate: string;
};

export type BulkPublishState = {
  schedule: BulkSchedule;
  groups: BulkGroup[];
  /** PHASE 9 Limited Bulk Production Pilot — optional for older stores. */
  pilot?: import("./pilot-config").BulkPilotConfig;
};

export type Store = {
  posts: Post[];
  partners: Partner[];
  adVendors: AdVendor[];
  banners: Banner[];
  categories: Category[];
  settings: Settings;
  bulkPublish: BulkPublishState;
  /** Per-host main landing + vendor (shared posts/settings). */
  hostProfiles?: Record<string, HostSiteProfile>;
  /** Region keyword → shared vendor (Brand Studio). */
  vendorGroups?: import("./vendor-groups").VendorGroupRecord[];
};
