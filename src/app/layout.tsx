import type { Metadata, Viewport } from "next";
import "./magazine.css";
import "./globals.css";
import "./theme-press.css";
import "./theme-night.css";
import "./theme-journal.css";
import "./theme-qna.css";
import "./theme-talk.css";
import "./theme-portal.css";
import "./theme-carrot.css";
import "./theme-studio.css";
import { siteBrand } from "@/lib/categories";
import { getSettings, getSettingsForRequestHost } from "@/lib/db";
import { getRequestHost } from "@/lib/host-profiles";
import { resolvePublicOrigin } from "@/lib/main-landing/resolve-origin";
import { resolveNaverVerification } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const host = await getRequestHost();
  const settings = host ? await getSettingsForRequestHost(host) : await getSettings();
  const brand = siteBrand(settings);
  const naverVerification = resolveNaverVerification(settings.naverSiteVerification);
  const origin = await resolvePublicOrigin();
  return {
    title: {
      default: `${brand.name} — ${brand.tagline}`,
      template: `%s | ${brand.name}`,
    },
    description: brand.description,
    metadataBase: new URL(origin),
    robots: { index: true, follow: true },
    openGraph: {
      title: `${brand.name} — ${brand.tagline}`,
      description: brand.description,
      url: origin,
      siteName: brand.name,
      locale: "ko_KR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${brand.name} — ${brand.tagline}`,
      description: brand.description,
    },
    other: naverVerification
      ? {
          "naver-site-verification": naverVerification,
        }
      : undefined,
    alternates: {
      types: {
        "application/rss+xml": "/rss.xml",
      },
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
