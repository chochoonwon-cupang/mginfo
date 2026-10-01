import { bannedContentError, collectPublishText } from "../banned-keywords";
import { discoverWebFolderImages } from "../web-image-folder";
import { extractPlaceName, getNearbyDistricts, getNearbyStations, parseNameList } from "../region-geo";
import { pickRandomPostImages, mergeImageUrls } from "../image-pool";
import { cleanHtml } from "../sanitize";
import { articleSlug } from "../slug";
import type { Settings } from "../types";
import { normalizeHttpUrl } from "../vendor";
import { ensureVendorSlots } from "../vendor-slots";
import { preferYoutubePair } from "../youtube";
import { withUniqueTitle } from "../title-uniqueness";
import type { HubBoardCampaign, HubBoardKeyword } from "../hub-board";
import type { OpsSite } from "../ops-ledger";
import { defaultHubBoardTemplateId, getHubBoardTemplate } from "./registry";
import type { HubBoardTemplateDraft } from "./types";

function seedFrom(...parts: string[]) {
  let h = 2166136261;
  const text = parts.join("|");
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export async function renderHubBoardTemplateArticle(
  campaign: HubBoardCampaign,
  keyword: HubBoardKeyword,
  site: OpsSite,
  settings: Settings,
  avoid?: { titles?: string[]; keywords?: string[]; bodies?: string[] }
) {
  const template = getHubBoardTemplate(campaign.templateId || defaultHubBoardTemplateId());
  if (!template) throw new Error("선택한 양식을 찾을 수 없습니다.");

  const keywordBan = bannedContentError(
    settings.publishBannedKeywords,
    keyword.keyword,
    campaign.vendorName,
    campaign.extraPrompt
  );
  if (keywordBan) throw new Error(keywordBan);

  const place =
    extractPlaceName(keyword.keyword, campaign.title, site.concept, site.siteName) ||
    extractPlaceName(keyword.keyword) ||
    "";
  const nearby = place ? getNearbyDistricts(place, 5) : [];
  const stations = place ? getNearbyStations(place, 5) : [];
  const baseSeed = seedFrom(campaign.id, keyword.id, site.id || site.domain, keyword.keyword);

  const avoidTitles = (avoid?.titles || []).map((item) => String(item || "").trim()).filter(Boolean);
  let attempt = 0;

  // Template pages intentionally share breed knowledge; uniqueness is title + place/vendor/variant.
  const article = await withUniqueTitle(
    async () => {
      const variant = baseSeed + attempt * 31;
      attempt += 1;
      const draft: HubBoardTemplateDraft = template.build({
        place,
        keyword: keyword.keyword,
        topic: template.topicLabel,
        vendor: {
          vendorName: campaign.vendorName,
          vendorPhone: campaign.vendorPhone,
          vendorWebsite: campaign.vendorWebsite,
          vendorKakao: campaign.vendorKakao,
        },
        variant,
        nearby,
        stations,
        siteSeed: site.domain || site.id,
      });
      return {
        title: draft.title,
        excerpt: draft.excerpt,
        bodyHtml: draft.bodyHtml,
        faqItems: draft.faqItems,
        regionInfo: draft.regionInfo,
        nearbyAreas: draft.nearbyAreas,
        nearbyStations: draft.nearbyStations,
        slugHint: draft.slugHint,
      };
    },
    avoidTitles,
    keyword.keyword
  );

  const generatedBan = bannedContentError(
    settings.publishBannedKeywords,
    collectPublishText({
      title: article.title,
      excerpt: article.excerpt,
      bodyHtml: article.bodyHtml,
      focusKeyword: keyword.keyword,
      tags: ["자유게시판", template.topicLabel],
    })
  );
  if (generatedBan) throw new Error(generatedBan);

  let imagePool = mergeImageUrls(
    [],
    campaign.imagePool || (campaign.coverImage ? [campaign.coverImage] : [])
  );
  if (!imagePool.length && campaign.imageFolderUrl) {
    try {
      const found = await discoverWebFolderImages(campaign.imageFolderUrl);
      imagePool = found.urls;
    } catch {
      imagePool = [];
    }
  }
  const photos = pickRandomPostImages(
    imagePool,
    campaign.imageCountMin || 1,
    campaign.imageCountMax || 3
  );
  const youtube = preferYoutubePair(keyword, campaign);
  const region = extractPlaceName(article.title, keyword.keyword) || place;

  return {
    hubCampaignId: `${campaign.id}:${keyword.id}`,
    title: article.title,
    excerpt: article.excerpt || keyword.keyword,
    // 지역·공공 팩트는 본문에 심지 않고 글 페이지 하단 접기에서만 노출
    bodyHtml: cleanHtml(ensureVendorSlots(article.bodyHtml || "")),
    coverImage: photos.cover || "",
    extraImages: photos.extras,
    focusKeyword: keyword.keyword,
    faqItems: article.faqItems,
    regionInfo: article.regionInfo || region,
    nearbyAreas: parseNameList(article.nearbyAreas),
    nearbyStations: parseNameList(article.nearbyStations),
    slug: articleSlug(article.slugHint, keyword.keyword),
    vendorName: campaign.vendorName || "",
    vendorPhone: campaign.vendorPhone || "",
    vendorWebsite: campaign.vendorWebsite || "",
    vendorKakao: campaign.vendorKakao || "",
    vendorId: campaign.vendorId || "",
    vendorIds: campaign.vendorIds || (campaign.vendorId ? [campaign.vendorId] : []),
    region,
    vendorRecruitSlot: Boolean(campaign.vendorRecruitSlot),
    hubVendorRegisterUrl: normalizeHttpUrl(settings.vendorRegisterUrl) || "",
    youtubeUrl1: youtube.youtubeUrl1 || "",
    youtubeUrl2: youtube.youtubeUrl2 || "",
    contentMode: "template" as const,
    templateId: template.id,
  };
}
