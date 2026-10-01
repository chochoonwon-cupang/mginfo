import { NextResponse } from "next/server";
import { isAdminSession, isMasterSession, siteAccountFrom, validateSiteAccount } from "@/lib/auth";
import { getSettings, getSettingsForRequestHost, readStore, updateStore } from "@/lib/db";
import {
  applyHostScopedAdminPatch,
  getRequestHost,
  isKeywordSubdomainHost,
  mergeHostIntoSettings,
  resolveHostProfile,
} from "@/lib/host-profiles";
import {
  DEFAULT_COMMENT_MAX,
  DEFAULT_COMMENT_MIN,
  DEFAULT_LIKE_MAX,
  DEFAULT_LIKE_MIN,
  clampCount,
  orderedRange,
} from "@/lib/engagement";
import { persistFail } from "@/lib/persist-api";
import { revalidatePublicSite } from "@/lib/public-cache";
import { isOpsHub } from "@/lib/ops-hub";
import { applyMasterSettingsPatch } from "@/lib/settings-apply";
import { isSiteThemeId } from "@/lib/site-theme";
import { isWritingToneId } from "@/lib/writing-tone";
import { normalizeHttpUrl } from "@/lib/vendor";
import { parseMainLandingConfig } from "@/lib/main-landing";
import { parseHubPortalConfig } from "@/lib/hub-portal";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const host = await getRequestHost();
  const globalSettings = await getSettings();
  let settings = globalSettings;
  let hostScoped = false;
  let hasHostProfile = false;
  if (host && isKeywordSubdomainHost(host)) {
    hostScoped = true;
    const store = await readStore();
    const profile = resolveHostProfile(store, host);
    hasHostProfile = Boolean(profile);
    settings = profile
      ? mergeHostIntoSettings(globalSettings, profile)
      : globalSettings;
  } else if (host) {
    settings = await getSettingsForRequestHost(host);
  }
  const master = await isMasterSession();
  const { geminiApiKey, geminiModel, naverSiteVerification, sitePassword, publishBannedKeywords, ...rest } = settings;
  return NextResponse.json({
    opsHub: await isOpsHub(),
    hostScoped,
    hasHostProfile,
    hostKey: hostScoped ? host : undefined,
    settings: {
      ...rest,
      geminiApiKey: master && geminiApiKey ? `${geminiApiKey.slice(0, 6)}••••${geminiApiKey.slice(-4)}` : "",
      geminiModel: master ? geminiModel : undefined,
      hasKey: Boolean(geminiApiKey),
      naverSiteVerification: master ? naverSiteVerification || "" : undefined,
      sitePassword: master ? sitePassword : undefined,
      publishBannedKeywords: master ? publishBannedKeywords || [] : undefined,
    },
  });
}

export async function POST(request: Request) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const wantsGemini =
    (typeof body.geminiApiKey === "string" && body.geminiApiKey && !body.geminiApiKey.includes("•")) ||
    typeof body.geminiModel === "string";
  const wantsMaster =
    wantsGemini ||
    body.usableUntil !== undefined ||
    body.dailyPostLimit !== undefined ||
    body.naverRankWork !== undefined ||
    body.naverSiteVerification !== undefined ||
    body.extraImagesEnabled !== undefined ||
    body.siteUsername !== undefined ||
    body.sitePassword !== undefined ||
    body.publishBannedKeywords !== undefined ||
    body.staffNotice !== undefined ||
    body.staffNoticeEnabled !== undefined ||
    body.staffNoticeTitle !== undefined ||
    body.staffNoticeBody !== undefined;
  if (wantsMaster && !(await isMasterSession())) {
    return NextResponse.json(
      { error: "마스터 관리자만 마스터 설정을 바꿀 수 있습니다." },
      { status: 403 }
    );
  }
  let nextSiteUser = "";
  let nextSitePass = "";
  if (typeof body.siteUsername === "string" || typeof body.sitePassword === "string") {
    const current = siteAccountFrom(await getSettings());
    nextSiteUser = typeof body.siteUsername === "string" ? body.siteUsername.trim() : current.username;
    nextSitePass = typeof body.sitePassword === "string" ? body.sitePassword : current.password;
    const invalid = validateSiteAccount(nextSiteUser, nextSitePass);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }
  }
  const requestHost = await getRequestHost();
  const keywordSubdomain = Boolean(requestHost && isKeywordSubdomainHost(requestHost));
  try {
    await updateStore((s) => {
      applyMasterSettingsPatch(s, body);
      if (keywordSubdomain) {
        applyHostScopedAdminPatch(s, requestHost, body as Record<string, unknown>);
      }
      const textKeys = [
        "siteName",
        "siteTagline",
        "company",
        "ceo",
        "bizNo",
        "address",
        "phone",
        "email",
        "carrotKeywords",
        "popupTitle",
        "popupBody",
        "popupCta",
        "popupHref",
        "popupImage",
        "writingPersona",
        "footerDisclaimer",
      ] as const;
      const hostOnlyText = new Set([
        "siteName",
        "siteTagline",
        "company",
        "ceo",
        "bizNo",
        "address",
        "phone",
        "email",
        "footerDisclaimer",
      ]);
      for (const key of textKeys) {
        if (typeof body[key] === "string") {
          if (keywordSubdomain && hostOnlyText.has(key)) continue;
          s.settings[key] = body[key].trim();
        }
      }
      if (typeof body.vendorRegisterUrl === "string") {
        s.settings.vendorRegisterUrl = normalizeHttpUrl(body.vendorRegisterUrl) || "";
      }
      if (isSiteThemeId(body.siteTheme)) {
        s.settings.siteTheme = body.siteTheme;
      }
      if (isWritingToneId(body.writingTone)) {
        s.settings.writingTone = body.writingTone;
      }
      if (typeof body.popupEnabled === "boolean") {
        s.settings.popupEnabled = body.popupEnabled;
      } else if (body.popupEnabled === "true" || body.popupEnabled === "1") {
        s.settings.popupEnabled = true;
      } else if (body.popupEnabled === "false" || body.popupEnabled === "0") {
        s.settings.popupEnabled = false;
      }
      if (body.likeCountMin != null || body.likeCountMax != null) {
        const likes = orderedRange(
          clampCount(body.likeCountMin, s.settings.likeCountMin ?? DEFAULT_LIKE_MIN),
          clampCount(body.likeCountMax, s.settings.likeCountMax ?? DEFAULT_LIKE_MAX)
        );
        s.settings.likeCountMin = likes.min;
        s.settings.likeCountMax = likes.max;
      }
      if (body.commentCountMin != null || body.commentCountMax != null) {
        const comments = orderedRange(
          clampCount(body.commentCountMin, s.settings.commentCountMin ?? DEFAULT_COMMENT_MIN),
          clampCount(body.commentCountMax, s.settings.commentCountMax ?? DEFAULT_COMMENT_MAX)
        );
        s.settings.commentCountMin = comments.min;
        s.settings.commentCountMax = comments.max;
      }
      if (body.mainLanding !== undefined && !keywordSubdomain) {
        s.settings.mainLanding = parseMainLandingConfig(body.mainLanding);
      }
      if (body.hubPortal !== undefined) {
        s.settings.hubPortal = parseHubPortalConfig(body.hubPortal);
      }
    });
  } catch (err) {
    return persistFail(err);
  }
  revalidatePublicSite();
  return NextResponse.json({ ok: true });
}
