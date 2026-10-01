import { NextResponse } from "next/server";
import { checkMasterPassword } from "@/lib/auth";
import { getSettings, readStore, updateStore } from "@/lib/db";
import {
  getHostProfile,
  hostProfileFromBootstrapBody,
  normalizeHostKey,
  parseHostSiteProfile,
  upsertKeywordHostProfile,
} from "@/lib/host-profiles";
import { enrichMainLandingCopy, mainLandingEnabled, parseMainLandingConfig } from "@/lib/main-landing";
import { persistFail } from "@/lib/persist-api";
import { revalidatePublicSite } from "@/lib/public-cache";
import { isSiteThemeId } from "@/lib/site-theme";
import { generateSiteTagline, isBlandSiteTagline } from "@/lib/site-tagline";
import { mergeBootstrapVendor } from "@/lib/host-vendor-sync";
import { normalizeVendorGroups } from "@/lib/vendor-groups";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorize(request: Request) {
  return checkMasterPassword(request.headers.get("x-infocs-master") || "");
}

/** Brand Studio(PC)가 클론 생성 직후 메인랜딩·테마·업체 정보를 심을 때 사용 */
export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const hostKey = normalizeHostKey(
    typeof body.host === "string" ? body.host : typeof body.domain === "string" ? body.domain : ""
  );
  const multiHost = Boolean(hostKey);
  if (body.mainLanding !== undefined && !hostKey) {
    return NextResponse.json(
      { error: "host required — use keyword subdomain (e.g. keyword.apex.co.kr), not apex/www only" },
      { status: 400 }
    );
  }
  const wantEnrich = body.enrich === true && body.mainLanding !== undefined;
  const useGemini = body.enrich === true;
  const geminiFromStudio =
    typeof body.geminiApiKey === "string" && body.geminiApiKey.trim() && !body.geminiApiKey.includes("•")
      ? body.geminiApiKey.trim()
      : "";
  const geminiModel =
    typeof body.geminiModel === "string" && body.geminiModel.trim() ? body.geminiModel.trim() : "";
  const incomingTagline =
    typeof body.siteTagline === "string" && body.siteTagline.trim() ? body.siteTagline.trim() : "";

  try {
    await updateStore((s) => {
      if (geminiFromStudio) s.settings.geminiApiKey = geminiFromStudio;
      if (geminiModel) s.settings.geminiModel = geminiModel;
      if (isSiteThemeId(body.siteTheme)) s.settings.siteTheme = body.siteTheme;
      if (Array.isArray(body.vendorGroups)) {
        s.vendorGroups = normalizeVendorGroups(body.vendorGroups);
      }

      if (multiHost) {
        const keyword = String(body.siteName || body.mainLanding?.vendor?.keyword || "").trim();
        const groups = normalizeVendorGroups(s.vendorGroups);
        let mainLandingRaw = body.mainLanding;
        if (mainLandingRaw && keyword && groups.length) {
          const merged = mergeBootstrapVendor(
            keyword,
            (mainLandingRaw as { vendor?: Record<string, unknown> }).vendor || {},
            groups
          );
          mainLandingRaw = {
            ...(mainLandingRaw as object),
            vendor: merged.vendor,
          };
          (body as Record<string, unknown>)._vendorGroupId = merged.groupId;
        }
        const bootstrapBody: Record<string, unknown> = {
          ...(body as Record<string, unknown>),
          mainLanding: mainLandingRaw,
          company:
            (body as Record<string, unknown>)._vendorGroupId && mainLandingRaw
              ? (mainLandingRaw as { vendor?: { name?: string } }).vendor?.name
              : body.company,
        };
        if (incomingTagline) bootstrapBody.siteTagline = incomingTagline;
        upsertKeywordHostProfile(s, hostKey, bootstrapBody);
        return;
      }

      if (typeof body.siteName === "string" && body.siteName.trim()) {
        s.settings.siteName = body.siteName.trim();
      }
      if (incomingTagline) s.settings.siteTagline = incomingTagline;
      if (typeof body.company === "string") s.settings.company = body.company.trim();
      if (typeof body.phone === "string") s.settings.phone = body.phone.trim();
      if (typeof body.address === "string") s.settings.address = body.address.trim();
      if (typeof body.bizNo === "string") s.settings.bizNo = body.bizNo.trim();
      if (typeof body.naverSiteVerification === "string") {
        s.settings.naverSiteVerification = body.naverSiteVerification.trim();
      }
      if (body.mainLanding !== undefined) {
        s.settings.mainLanding = parseMainLandingConfig({
          ...body.mainLanding,
          enabled: true,
        });
      }
    });

    let siteTagline = incomingTagline;
    let taglineGenerated = false;
    if (!siteTagline || isBlandSiteTagline(siteTagline)) {
      const settings = await getSettings();
      const keyword = String(body.siteName || settings.siteName || "").trim();
      if (keyword) {
        const apiKey = geminiFromStudio || settings.geminiApiKey || process.env.GEMINI_API_KEY || "";
        const designId =
          typeof body.mainLanding === "object" && body.mainLanding
            ? String((body.mainLanding as { designId?: string }).designId || "scalp-tattoo-v1")
            : "scalp-tattoo-v1";
        siteTagline = await generateSiteTagline({
          keyword,
          vendorName: typeof body.company === "string" ? body.company : settings.company,
          apiKey,
          model: geminiModel || settings.geminiModel,
          seed: `${keyword}|bootstrap${hostKey ? `|${hostKey}` : ""}`,
          useGemini,
          designId,
        });
        taglineGenerated = true;
        await updateStore((s) => {
          if (multiHost && hostKey) {
            if (s.hostProfiles?.[hostKey]) {
              s.hostProfiles[hostKey].siteTagline = siteTagline;
              if (s.hostProfiles[hostKey].mainLanding?.vendor) {
                s.hostProfiles[hostKey].mainLanding.vendor.intro = siteTagline;
              }
            } else {
              upsertKeywordHostProfile(s, hostKey, {
                ...(body as Record<string, unknown>),
                siteTagline,
                mainLanding: body.mainLanding,
              });
            }
          } else {
            s.settings.siteTagline = siteTagline;
          }
        });
      }
    }

    let enriched = false;
    let enrichError = "";
    if (wantEnrich) {
      const settings = await getSettings();
      const apiKey =
        geminiFromStudio || settings.geminiApiKey || process.env.GEMINI_API_KEY || "";
      if (!apiKey) {
        enrichError =
          "제미나이 사용 체크됐으나 API 키 없음 — 계정 설정에 Gemini API Key를 저장하세요.";
      } else {
        try {
          let config = parseMainLandingConfig(body.mainLanding);
          if (multiHost && hostKey) {
            const store = await readStore();
            const storeProfile = store.hostProfiles?.[hostKey];
            if (storeProfile?.mainLanding) config = parseMainLandingConfig(storeProfile.mainLanding);
          } else {
            config = parseMainLandingConfig(settings.mainLanding);
          }
          const keyword = String(body.siteName || config.vendor.keyword || settings.siteName || "").trim();
          const copyOverride = await enrichMainLandingCopy({
            config,
            siteName: keyword || settings.siteName,
            apiKey,
            model: settings.geminiModel,
          });
          const enrichedAt = new Date().toISOString();
          await updateStore((s) => {
            const nextLanding = parseMainLandingConfig({
              ...config,
              enabled: true,
              copyOverride,
              enrichedAt,
            });
            if (multiHost && hostKey) {
              if (!s.hostProfiles) s.hostProfiles = {};
              const row = s.hostProfiles[hostKey] || hostProfileFromBootstrapBody(body as Record<string, unknown>);
              row.mainLanding = nextLanding;
              row.updatedAt = enrichedAt;
              s.hostProfiles[hostKey] = row;
            } else {
              s.settings.mainLanding = nextLanding;
            }
          });
          enriched = true;
        } catch (err) {
          enrichError = err instanceof Error ? err.message : "내용 보충 실패";
        }
      }
    }

    revalidatePublicSite();

    const storeAfter = await readStore();
    let verify: {
      mainLandingEnabled: boolean;
      keyword: string;
      designId: string;
    } = { mainLandingEnabled: false, keyword: "", designId: "" };
    if (multiHost && hostKey) {
      const profile = getHostProfile(storeAfter, hostKey);
      const ml = profile?.mainLanding;
      verify = {
        mainLandingEnabled: mainLandingEnabled({ mainLanding: ml }),
        keyword: String(ml?.vendor?.keyword || profile?.siteName || "").trim(),
        designId: String(ml?.designId || "").trim(),
      };
    } else {
      const ml = parseMainLandingConfig(storeAfter.settings.mainLanding);
      verify = {
        mainLandingEnabled: mainLandingEnabled({ mainLanding: ml }),
        keyword: String(ml.vendor.keyword || storeAfter.settings.siteName || "").trim(),
        designId: String(ml.designId || "").trim(),
      };
    }

    return NextResponse.json({
      ok: true,
      host: hostKey || undefined,
      multiHost,
      enriched,
      siteTagline: siteTagline || undefined,
      taglineGenerated,
      verify,
      ...(enrichError ? { enrichError } : {}),
    });
  } catch (err) {
    return persistFail(err);
  }
}
