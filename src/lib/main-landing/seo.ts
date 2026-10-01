import { inferRegion } from "./designs/scalp-tattoo-v1";
import { buildMainLandingDocumentTitle } from "./parse";
import type { MainLandingConfig, MainLandingCopy, MainLandingResolvedImages } from "./types";

function trim(s: string, max: number) {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

export function buildMainLandingSeoDescription(
  landing: MainLandingConfig,
  fallbackDescription = ""
): string {
  const keyword = String(landing.vendor.keyword || "").trim();
  const suffix = String(landing.seoTitleSuffix || "").trim();
  const intro = String(landing.vendor.intro || "").trim();
  const region = String(landing.vendor.region || "").trim() || inferRegion(landing.vendor);
  const industry = String(landing.vendor.industry || "").trim();
  const address = String(landing.vendor.address || "").trim();

  if (intro.length >= 24) return trim(intro, 160);

  const parts: string[] = [];
  if (keyword) parts.push(keyword);
  if (landing.designId === "demolition-v1") {
    parts.push("폐업철거·상가철거·원상복구");
    parts.push("무료 방문 견적·폐업지원금 상담");
  }
  if (suffix) parts.push(suffix);
  if (region && region !== "스튜디오") parts.push(`${region} 현장 맞춤`);
  else if (address) parts.push(address);
  else if (industry) parts.push(industry);

  const built = parts.filter(Boolean).join(". ");
  if (built.length >= 28) return trim(built, 160);
  if (fallbackDescription) return trim(fallbackDescription, 160);
  return trim(built || keyword || "지역 맞춤 안내", 160);
}

export function buildMainLandingKeywords(landing: MainLandingConfig): string[] {
  const keyword = String(landing.vendor.keyword || "").trim();
  const suffix = String(landing.seoTitleSuffix || "").trim();
  const region = String(landing.vendor.region || "").trim() || inferRegion(landing.vendor);
  const out = new Set<string>();
  if (keyword) out.add(keyword);
  if (suffix) {
    for (const token of suffix.split(/[\s·|/]+/)) {
      const t = token.trim();
      if (t.length >= 2) out.add(t);
    }
  }
  if (region && region !== "스튜디오") out.add(region);
  if (landing.designId === "demolition-v1") {
    ["폐업철거", "상가철거", "원상복구", "폐업지원금", "철거견적"].forEach((k) => out.add(k));
    if (keyword && !keyword.includes("철거")) out.add(`${keyword.replace(/\s+/g, "")} 철거`);
  }
  return [...out].slice(0, 12);
}

export function pickMainLandingOgImage(
  landing: MainLandingConfig,
  resolved: MainLandingResolvedImages
): string {
  const slotHero = String(landing.slots?.hero || "").trim();
  if (slotHero) return slotHero;
  if (resolved.hero) return resolved.hero;
  if (resolved.gallery[0]) return resolved.gallery[0];
  if (resolved.about) return resolved.about;
  return "";
}

export function buildMainLandingOpenGraphImages(
  landing: MainLandingConfig,
  resolved: MainLandingResolvedImages,
  alt: string
) {
  const url = pickMainLandingOgImage(landing, resolved);
  if (!url) return undefined;
  return [
    {
      url,
      width: 1200,
      height: 630,
      alt: alt || buildMainLandingDocumentTitle(landing),
    },
  ];
}

export function buildMainLandingLocalBusinessJsonLd(input: {
  landing: MainLandingConfig;
  pageUrl: string;
  description: string;
  imageUrl?: string;
}) {
  const { landing, pageUrl, description, imageUrl } = input;
  const v = landing.vendor;
  const keyword = String(v.keyword || "").trim();
  const name = keyword || String(v.name || "").trim() || "지역 서비스";
  const legal = String(v.name || "").trim();
  const region = String(v.region || "").trim() || inferRegion(v);
  return {
    "@type": "LocalBusiness",
    "@id": `${pageUrl}#business`,
    name,
    ...(legal && legal !== name ? { legalName: legal } : {}),
    description,
    url: pageUrl,
    ...(imageUrl ? { image: [imageUrl] } : {}),
    ...(v.phone ? { telephone: v.phone } : {}),
    ...(region && region !== "스튜디오" ? { areaServed: region } : {}),
    ...(v.address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: v.address,
            addressCountry: "KR",
          },
        }
      : {}),
    ...(v.businessNumber ? { taxID: v.businessNumber } : {}),
  };
}

export function buildMainLandingJsonLdGraph(input: {
  landing: MainLandingConfig;
  copy: MainLandingCopy;
  pageUrl: string;
  description: string;
  imageUrl?: string;
}) {
  const { landing, copy, pageUrl, description, imageUrl } = input;
  const keyword = String(landing.vendor.keyword || "").trim();
  const siteName = keyword || buildMainLandingDocumentTitle(landing);
  const business = buildMainLandingLocalBusinessJsonLd({
    landing,
    pageUrl,
    description,
    imageUrl,
  });

  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebSite",
      "@id": `${pageUrl}#website`,
      url: pageUrl,
      name: siteName,
      description,
      inLanguage: "ko-KR",
      publisher: { "@id": `${pageUrl}#business` },
    },
    business,
  ];

  const faqs = (copy.faqs || []).filter((f) => f.q && f.a);
  if (faqs.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${pageUrl}#faq`,
      url: `${pageUrl}#faq`,
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: f.a,
        },
      })),
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

