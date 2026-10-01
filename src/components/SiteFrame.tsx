import { CategoriesProvider } from "@/components/CategoriesContext";
import { EngagementProvider } from "@/components/EngagementContext";
import { SiteNameProvider } from "@/components/SiteNameContext";
import { SitePopup } from "@/components/SitePopup";
import { BottomNav, Footer, Header } from "@/components/Header";
import { JsonLd } from "@/components/seo/JsonLd";
import { displaySiteName, siteBrand } from "@/lib/categories";
import { getCategories, getSettings, getSettingsForRequestHost, resolveSiteTheme } from "@/lib/db";
import { getRequestHost } from "@/lib/host-profiles";
import { engagementFromSettings } from "@/lib/engagement";
import { buildOrganizationJsonLd, buildWebSiteJsonLd } from "@/lib/site-jsonld";
import type { SiteTheme } from "@/lib/site-theme";

export async function SiteFrame({
  children,
  active,
  current,
  hideBottomNav = false,
  className = "",
  bare = false,
}: {
  children: React.ReactNode;
  active?: "home" | "posts" | "partners" | "write";
  current?: string;
  hideBottomNav?: boolean;
  className?: string;
  /** Skip magazine chrome (used by brand main landing). */
  bare?: boolean;
}) {
  const host = await getRequestHost();
  const [theme, baseSettings, categories] = await Promise.all([
    resolveSiteTheme(),
    getSettings(),
    getCategories(),
  ]);
  const settings = host ? await getSettingsForRequestHost(host) : baseSettings;
  const siteName = displaySiteName(settings.siteName);
  const { description } = siteBrand(settings);
  const mainLandingOn = Boolean(settings.mainLanding?.enabled);
  const jsonLd = (
    <JsonLd data={[buildWebSiteJsonLd(siteName, description), buildOrganizationJsonLd(siteName, settings, description)]} />
  );
  const body = (
    <SiteNameProvider name={siteName}>
      <EngagementProvider value={engagementFromSettings(settings)}>
        <CategoriesProvider categories={categories}>{children}</CategoriesProvider>
      </EngagementProvider>
    </SiteNameProvider>
  );

  if (bare) {
    return (
      <div className={className.trim() || undefined}>
        {jsonLd}
        {body}
      </div>
    );
  }

  return (
    <div className={`${theme.rootClass} ${className}`.trim()}>
      {jsonLd}
      <Header themeId={theme.id} active={active} siteName={siteName} mainLandingEnabled={mainLandingOn} />
      {body}
      <Footer themeId={theme.id} settings={settings} />
      {hideBottomNav ? null : <BottomNav current={current} categories={categories} />}
      <SitePopup
        enabled={Boolean(settings.popupEnabled)}
        title={settings.popupTitle || ""}
        body={settings.popupBody || ""}
        cta={settings.popupCta || "확인"}
        href={settings.popupHref || "/posts"}
        image={settings.popupImage || ""}
        themeId={theme.id}
      />
    </div>
  );
}

export async function getPublicTheme(): Promise<SiteTheme> {
  return resolveSiteTheme();
}
