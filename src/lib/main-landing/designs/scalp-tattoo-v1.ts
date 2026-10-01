import { FELIX_SCALP_DEFAULT, fillDeep, type FelixTemplateVars } from "../felix-defaults";
import { extractRegionLabel, findRegionHint, pickRegionDong, resolveVendorAddress } from "../auto-address";
import type { MainLandingCopy, MainLandingVendor } from "../types";

export const SCALP_TATTOO_V1 = {
  id: "scalp-tattoo-v1" as const,
  label: "두피문신",
  description: "필릭스스칼프형 — 히어로·소개·과정·시술·갤러리·원장·후기·FAQ (문의폼 없음)",
};

/** 키워드·주소에서 짧은 지역명 추정 */
export function inferRegion(vendor: MainLandingVendor): string {
  const explicit = String(vendor.region || "").trim();
  if (explicit) return explicit;
  const hint = findRegionHint(vendor.keyword || "");
  if (hint?.city) {
    const short = hint.city.replace(/광역시|특별시|특별자치시|도 /g, "").split(/\s+/)[0] || "";
    if (short) return short.replace(/(시|군)$/, "") || short;
  }
  const stripped = extractRegionLabel(vendor.keyword || "");
  if (stripped.length >= 2 && stripped.length <= 8 && stripped !== "지역") return stripped;
  const address = String(vendor.address || "");
  const m = address.match(/(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)?\s*([가-힣]{2,8}(?:시|군|구|동|읍|면)?)/);
  if (m?.[1]) return m[1].replace(/(시|군|구)$/, "") || m[1];
  return "스튜디오";
}

export function inferPlace(vendor: MainLandingVendor, region: string): string {
  const address = String(vendor.address || "");
  const dong = address.match(/([가-힣]+(?:동|읍|면|로|길))/);
  if (dong?.[1]) return dong[1];
  const hint = findRegionHint(vendor.keyword || "");
  if (hint?.dongs?.length) return pickRegionDong(vendor.keyword || "", hint);
  if (/국제도시|비전동|청라/.test(address)) {
    const hit = address.match(/(청라국제도시|비전동|청라|비전)/);
    if (hit) return hit[1];
  }
  return region;
}

export function buildFelixVars(vendor: MainLandingVendor, siteName: string): FelixTemplateVars {
  const keyword = String(vendor.keyword || siteName || "두피문신").trim() || "두피문신";
  const brand = String(vendor.name || "필릭스스칼프").trim() || "필릭스스칼프";
  const region = inferRegion(vendor);
  const place = inferPlace(vendor, region);
  const address = resolveVendorAddress({ address: vendor.address, keyword, name: brand });
  const full = `${keyword} ${brand}`.trim();
  return { keyword, brand, region, place, address, full };
}

export function buildScalpTattooV1Base(
  vendor: MainLandingVendor,
  siteName: string
): Omit<MainLandingCopy, "accent" | "theme" | "sectionOrder"> {
  const vars = buildFelixVars(vendor, siteName);
  const filled = fillDeep(FELIX_SCALP_DEFAULT, vars);
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
    directorGroups: filled.directorGroups.map((g) => ({
      title: g.title,
      items: [...g.items],
    })),
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
  };
}
