import { SiteFrame, getPublicTheme } from "@/components/SiteFrame";
import { CategoryBar } from "@/components/CategoryBar";
import { IndexList } from "@/components/IndexList";
import { PartnerStrip } from "@/components/PartnerStrip";
import { PostCard } from "@/components/PostCard";
import { PromoBanner } from "@/components/PromoBanner";
import { DemolitionLandingPage } from "@/components/main-landing/DemolitionLandingPage";
import { MainLandingPage } from "@/components/main-landing/MainLandingPage";
import { HubPortalPage } from "@/components/hub-portal/HubPortalPage";
import { NightHome } from "@/components/themes/NightHome";
import { JournalHome } from "@/components/themes/JournalHome";
import { QnaHome } from "@/components/themes/QnaHome";
import { TalkHome } from "@/components/themes/TalkHome";
import { PortalHome } from "@/components/themes/PortalHome";
import { CarrotHome } from "@/components/themes/CarrotHome";
import { StudioHome } from "@/components/themes/StudioHome";
import { displaySiteName, parseCarrotKeywords, siteBrand } from "@/lib/categories";
import { pickRandomBanner } from "@/lib/banners";
import { getEnabledBanners, getPartners, getPublishedPosts, getSettings, getSettingsForRequestHost } from "@/lib/db";
import { getRequestHost } from "@/lib/host-profiles";
import {
  buildMainLandingCopy,
  buildMainLandingDocumentTitle,
  mainLandingEnabled,
  parseMainLandingConfig,
  resolveMainLandingImages,
} from "@/lib/main-landing";
import { resolvePublicOrigin } from "@/lib/main-landing/resolve-origin";
import {
  buildMainLandingJsonLdGraph,
  buildMainLandingKeywords,
  buildMainLandingOpenGraphImages,
  buildMainLandingSeoDescription,
} from "@/lib/main-landing/seo";
import { resolveNaverVerification } from "@/lib/seo";
import { getHubPortalFeed, hubPortalEnabled } from "@/lib/hub-portal";
import { isOpsHub } from "@/lib/ops-hub";
import { visitSeed } from "@/lib/shuffle";
import { siteUrl } from "@/lib/seo";
import type { Metadata } from "next";
import { Suspense } from "react";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const host = await getRequestHost();
  const baseSettings = await getSettings();
  const settings = host ? await getSettingsForRequestHost(host) : baseSettings;
  const origin = await resolvePublicOrigin();
  const brand = siteBrand(settings);
  if (hubPortalEnabled(baseSettings) && (await isOpsHub())) {
    return {
      title: { absolute: "인포씨에스 매거진 - 블로그 광고 사이트 통합 콘텐츠" },
      description: "전국의 웹 블로그 사이트 상위노출 포스팅을 확인해보세요.",
      alternates: { canonical: `${origin}/` },
      robots: { index: true, follow: true },
      openGraph: {
        title: "인포씨에스 매거진 - 블로그 광고 사이트 통합 콘텐츠",
        description: "전국의 웹 블로그 사이트 상위노출 포스팅을 확인해보세요.",
        url: siteUrl("/"),
        siteName: brand.name,
        locale: "ko_KR",
        type: "website",
      },
    };
  }
  const landing = parseMainLandingConfig(settings.mainLanding);
  if (landing.enabled) {
    const siteName = displaySiteName(settings.siteName);
    const name = landing.vendor.name || brand.name;
    const title = buildMainLandingDocumentTitle(landing, brand.name);
    const description = buildMainLandingSeoDescription(landing, brand.description);
    const keywords = buildMainLandingKeywords(landing);
    const resolvedImages = await resolveMainLandingImages(landing, siteName);
    const ogAlt = landing.vendor.keyword || title;
    const ogImages = buildMainLandingOpenGraphImages(landing, resolvedImages, ogAlt);
    const naverVerification = resolveNaverVerification(settings.naverSiteVerification);
    return {
      title: { absolute: title },
      description,
      keywords,
      alternates: { canonical: `${origin}/` },
      robots: { index: true, follow: true },
      openGraph: {
        title,
        description,
        url: `${origin}/`,
        siteName: landing.vendor.keyword || name,
        locale: "ko_KR",
        type: "website",
        images: ogImages,
      },
      twitter: {
        card: ogImages?.length ? "summary_large_image" : "summary",
        title,
        description,
        images: ogImages?.map((img) => img.url),
      },
      ...(naverVerification
        ? { other: { "naver-site-verification": naverVerification } as Record<string, string> }
        : {}),
    };
  }
  return {
    title: { absolute: `${brand.name} — ${brand.tagline}` },
    description: brand.description,
    keywords: [brand.name, brand.tagline, "매거진", "가이드"],
    alternates: { canonical: `${origin}/` },
    robots: { index: true, follow: true },
    openGraph: {
      title: `${brand.name} — ${brand.tagline}`,
      description: brand.description,
      url: `${origin}/`,
      siteName: brand.name,
      locale: "ko_KR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${brand.name} — ${brand.tagline}`,
      description: brand.description,
    },
  };
}

export default async function HomePage() {
  const host = await getRequestHost();
  const baseSettings = await getSettings();
  const settings = host ? await getSettingsForRequestHost(host) : baseSettings;
  if (hubPortalEnabled(baseSettings) && (await isOpsHub())) {
    const feed = await getHubPortalFeed();
    return (
      <SiteFrame bare hideBottomNav>
        <Suspense fallback={<div style={{ padding: 40, color: "#eee" }}>불러오는 중…</div>}>
          <HubPortalPage feed={feed} siteName={displaySiteName(baseSettings.siteName)} settings={baseSettings} />
        </Suspense>
      </SiteFrame>
    );
  }
  if (mainLandingEnabled(settings)) {
    const landing = parseMainLandingConfig(settings.mainLanding);
    const siteName = displaySiteName(settings.siteName);
    const copy = buildMainLandingCopy(landing, siteName);
    const images = await resolveMainLandingImages(landing, siteName);
    const pageUrl = `${await resolvePublicOrigin()}/`;
    const seoDescription = buildMainLandingSeoDescription(landing, siteBrand(settings).description);
    const jsonLd = buildMainLandingJsonLdGraph({
      landing,
      copy,
      pageUrl,
      description: seoDescription,
      imageUrl: images.hero || images.gallery[0] || "",
    });
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <SiteFrame bare hideBottomNav>
          {landing.designId === "demolition-v1" ? (
            <DemolitionLandingPage copy={copy} images={images} vendor={landing.vendor} />
          ) : (
            <MainLandingPage
              copy={copy}
              images={images}
              vendor={landing.vendor}
              designId={landing.designId}
            />
          )}
        </SiteFrame>
      </>
    );
  }

  const theme = await getPublicTheme();
  const posts = await getPublishedPosts();
  const cover = posts[0];
  const rest = posts.slice(1, 7);
  const partners = await getPartners();
  const banner = pickRandomBanner(await getEnabledBanners());
  const seed = visitSeed();

  if (theme.id === "studio") {
    return (
      <SiteFrame active="home">
        <StudioHome
          posts={posts}
          partners={partners}
          banner={banner}
          siteName={displaySiteName(settings.siteName)}
          tagline={settings.siteTagline}
          seed={seed}
        />
      </SiteFrame>
    );
  }

  if (theme.id === "carrot") {
    const settings = await getSettings();
    return (
      <SiteFrame active="home">
        <CarrotHome
          posts={posts}
          partners={partners}
          banner={banner}
          keywords={parseCarrotKeywords(settings.carrotKeywords)}
          seed={seed}
        />
      </SiteFrame>
    );
  }

  if (theme.id === "portal") {
    return (
      <SiteFrame active="home">
        <PortalHome posts={posts} partners={partners} banner={banner} seed={seed} />
      </SiteFrame>
    );
  }

  if (theme.id === "talk") {
    return (
      <SiteFrame active="home">
        <TalkHome posts={posts} partners={partners} banner={banner} />
      </SiteFrame>
    );
  }

  if (theme.id === "qna") {
    return (
      <SiteFrame active="home">
        <QnaHome posts={posts} partners={partners} banner={banner} />
      </SiteFrame>
    );
  }

  if (theme.id === "journal") {
    const settings = await getSettings();
    return (
      <SiteFrame active="home">
        <JournalHome
          posts={posts}
          partners={partners}
          banner={banner}
          siteName={displaySiteName(settings.siteName)}
        />
      </SiteFrame>
    );
  }

  if (theme.id === "night") {
    return (
      <SiteFrame active="home">
        <NightHome posts={posts} partners={partners} banner={banner} seed={seed} />
      </SiteFrame>
    );
  }

  if (theme.id === "press") {
    const settings = await getSettings();
    const brand = siteBrand(settings);
    const feed = posts.slice(0, 6);
    return (
      <SiteFrame active="home">
        <section className="press-mast">
          <p className="press-kicker">{brand.tagline}</p>
          <h1>{brand.name}</h1>
          <p className="press-dek">{brand.description}</p>
        </section>
        <main className="container">
          {banner ? <PromoBanner banner={banner} /> : null}
          {feed.length ? (
            <div className="press-feed">
              {feed.map((post, i) => (
                <PostCard key={post.id} post={post} featured={i === 0} />
              ))}
            </div>
          ) : (
            <p className="empty-note">아직 발행된 글이 없습니다. 관리자에서 첫 글을 발행해 보세요.</p>
          )}
        </main>
        <PartnerStrip partners={partners} title="제휴 업체" />
        <div className="container">
          <IndexList
            posts={posts}
            title="매거진 전체 글"
            description={`최근 발행한 글 ${posts.length}편입니다. 분야를 눌러 골라 보세요.`}
            moreHref="/posts"
            moreLabel="더 예전 글은 전체글에서 볼 수 있습니다."
          />
        </div>
      </SiteFrame>
    );
  }

  const brand = siteBrand(settings);
  return (
    <SiteFrame active="home">
      <section className="edit-hero">
        <p className="edit-kicker">{brand.tagline}</p>
        <h1>
          {brand.name}
          <span>{brand.tagline}</span>
        </h1>
        <p className="edit-dek">{brand.description}</p>
      </section>
      <main className="container">
        <CategoryBar />
        {banner ? <PromoBanner banner={banner} /> : null}
        {cover ? (
          <section className="edit-cover">
            <PostCard post={cover} featured />
          </section>
        ) : (
          <p className="empty-note">아직 발행된 글이 없습니다. 관리자에서 첫 글을 발행해 보세요.</p>
        )}
        {rest.length > 0 && (
          <section className="edit-latest">
            <div className="edit-section-head">
              <h2>이번 호의 이야기</h2>
              <p>일상 속에서 오래 남는 가이드와 시선</p>
            </div>
            <div className="post-grid">
              {rest.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </section>
        )}
      </main>
      <PartnerStrip partners={partners} />
      <div className="container">
        <IndexList posts={posts} />
      </div>
    </SiteFrame>
  );
}
