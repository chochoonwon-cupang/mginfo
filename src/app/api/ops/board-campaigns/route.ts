import { NextResponse } from "next/server";
import { checkMasterPassword, isAdminSession, isMasterSession } from "@/lib/auth";
import {
  appendCampaignKeywords,
  consentedSites,
  fetchSiteRecentPosts,
  generateHubBoardArticle,
  hubCampaignStats,
  hubBoardTodaySummary,
  hubTodayProgress,
  parseHubCampaign,
  parseKeywordList,
  planHubCampaign,
  resolveCampaignTargets,
  collectHubAvoidTitles,
  collectHubTodayKeywords,
  type HubBoardCampaign,
} from "@/lib/hub-board";
import {
  deleteHubCampaign,
  deleteHubKeyword,
  getHubCampaigns,
  planHubBoardToday,
  planOneHubCampaign,
  publishHubKeyword,
  upsertHubCampaign,
} from "@/lib/hub-board-store";
import { getSettings } from "@/lib/db";
import { isOpsHub } from "@/lib/ops-hub";
import { getOpsSites } from "@/lib/ops-store";
import { persistFail } from "@/lib/persist-api";
import { uid } from "@/lib/slug";
import type { OpsSite } from "@/lib/ops-ledger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function authorize(request: Request) {
  if (await isMasterSession()) return true;
  if (await isAdminSession()) return true;
  return checkMasterPassword(request.headers.get("x-infocs-master") || "");
}

function campaignPayload(campaign: ReturnType<typeof parseHubCampaign>) {
  if (!campaign) return null;
  return { ...campaign, stats: hubCampaignStats(campaign), today: hubTodayProgress(campaign) };
}

async function saveCampaignBody(body: Record<string, unknown>, sites: OpsSite[]) {
  const current = (await getHubCampaigns()).find((row) => row.id === String(body.id || ""));
  let campaign = parseHubCampaign(
    {
      ...body,
      id: String(body.id || current?.id || uid()),
      schedule: {
        enabled:
          typeof (body.schedule as { enabled?: boolean } | undefined)?.enabled === "boolean"
            ? Boolean((body.schedule as { enabled?: boolean }).enabled)
            : Boolean(current?.schedule.enabled ?? true),
        startHour: Number((body.schedule as { startHour?: number } | undefined)?.startHour || current?.schedule.startHour || 9),
        endHour: 23,
        planDate: current?.schedule.planDate || "",
      },
    },
    current
  );
  if (!campaign) throw new Error("캠페인을 만들지 못했습니다.");
  const resolved = resolveCampaignTargets(campaign, sites);
  campaign = resolved.campaign;
  if (!resolved.targets.length) throw new Error("발행할 사이트가 없습니다. 사이트 대장에서 광고글 동의를 켜 주세요.");
  const text = String(body.text || "");
  if (text.trim()) {
    campaign = appendCampaignKeywords(campaign, parseKeywordList(text)).campaign;
  }
  const planned = planHubCampaign({ ...campaign, updatedAt: new Date().toISOString() }, sites, new Date(), {
    force: true,
  });
  const list = await upsertHubCampaign(planned.campaign);
  const saved = list.find((row) => row.id === campaign.id) || planned.campaign;
  return { campaign: saved, planned: planned.planned, reason: planned.reason };
}

export async function GET(request: Request) {
  if (!(await isOpsHub())) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "마스터만 볼 수 있습니다." }, { status: 401 });
  }
  const force = new URL(request.url).searchParams.get("force") === "1";
  const planned = await planHubBoardToday({ force });
  const sites = await getOpsSites();
  const campaigns = planned.campaigns;
  return NextResponse.json({
    campaigns: campaigns.map((row) => campaignPayload(row)),
    today: hubBoardTodaySummary(campaigns),
    planned: planned.planned,
    planReasons: planned.reasons,
    siteCount: sites.length,
    consentedCount: consentedSites(sites).length,
    sites: consentedSites(sites).map((site) => ({
      id: site.id,
      siteName: site.siteName,
      domain: site.domain,
      apexDomain: site.apexDomain,
      concept: site.concept,
    })),
  });
}

export async function PUT(request: Request) {
  if (!(await isOpsHub())) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "마스터만 저장할 수 있습니다." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const items = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [body];
  if (!items.length) return NextResponse.json({ error: "저장할 광고가 없습니다." }, { status: 400 });
  try {
    const sites = await getOpsSites();
    const saved: HubBoardCampaign[] = [];
    let planned = 0;
    for (const item of items) {
      const result = await saveCampaignBody(item, sites);
      saved.push(result.campaign);
      planned += result.planned;
    }
    return NextResponse.json({
      ok: true,
      campaign: campaignPayload(saved[0]),
      campaigns: saved.map((row) => campaignPayload(row)),
      planned,
    });
  } catch (err) {
    if (err instanceof Error && /캠페인|사이트/.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return persistFail(err);
  }
}

export async function POST(request: Request) {
  if (!(await isOpsHub())) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "마스터만 발행할 수 있습니다." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    campaignId?: string;
    keywordId?: string;
    force?: boolean;
  };
  const action = String(body.action || "").trim();
  const campaignId = String(body.campaignId || "").trim();

  if (action === "plan") {
    if (!campaignId) return NextResponse.json({ error: "광고를 선택하세요." }, { status: 400 });
    try {
      const result = await planOneHubCampaign(campaignId, { force: body.force !== false });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
      return NextResponse.json({
        ok: true,
        planned: result.planned,
        reason: result.reason,
        campaign: campaignPayload(result.campaign),
        campaigns: result.campaigns.map((row) => campaignPayload(row)),
      });
    } catch (err) {
      return persistFail(err);
    }
  }

  /** Safe preview: run content-pipeline only — never push to external boards. */
  if (action === "preview") {
    const keywordId = String(body.keywordId || "").trim();
    if (!campaignId || !keywordId) {
      return NextResponse.json({ error: "미리볼 키워드를 선택하세요." }, { status: 400 });
    }
    try {
      const campaigns = await getHubCampaigns();
      const campaign = campaigns.find((row) => row.id === campaignId);
      const keyword = campaign?.keywords.find((row) => row.id === keywordId);
      if (!campaign || !keyword) {
        return NextResponse.json({ error: "키워드를 찾을 수 없습니다." }, { status: 404 });
      }
      const sites = await getOpsSites();
      const site =
        sites.find((row) => row.id === keyword.siteId) ||
        sites.find((row) => campaign.siteIds?.includes(row.id)) ||
        consentedSites(sites)[0];
      if (!site) {
        return NextResponse.json({ error: "미리볼 대상 사이트가 없습니다." }, { status: 400 });
      }
      const settings = await getSettings();
      const recent = await fetchSiteRecentPosts(site);
      const article = await generateHubBoardArticle(campaign, keyword, site, settings, {
        titles: collectHubAvoidTitles(campaigns, recent.titles),
        keywords: collectHubTodayKeywords(campaigns),
        bodies: recent.bodies,
      });
      return NextResponse.json({
        ok: true,
        preview: true,
        domain: site.domain,
        keyword: keyword.keyword,
        article: {
          title: article.title,
          excerpt: article.excerpt,
          bodyHtml: article.bodyHtml,
          slug: article.slug,
          industryId: "industryId" in article ? article.industryId : undefined,
          blueprintId: "blueprintId" in article ? article.blueprintId : undefined,
          generationMode: "generationMode" in article ? article.generationMode : undefined,
          generationLog: "generationLog" in article ? article.generationLog : undefined,
          faqItems: article.faqItems,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "미리보기 실패";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const keywordId = String(body.keywordId || "").trim();
  if (!campaignId || !keywordId) {
    return NextResponse.json({ error: "발행할 키워드를 선택하세요." }, { status: 400 });
  }
  try {
    const result = await publishHubKeyword(campaignId, keywordId);
    if (!result.ok || !("campaign" in result) || !result.campaign) {
      return NextResponse.json({ error: result.error || "발행 실패" }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      keyword: result.keyword,
      domain: result.domain,
      campaign: campaignPayload(result.campaign),
    });
  } catch (err) {
    return persistFail(err);
  }
}

export async function DELETE(request: Request) {
  if (!(await isOpsHub())) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "마스터만 삭제할 수 있습니다." }, { status: 401 });
  }
  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as { campaignId?: string; keywordId?: string };
  const campaignId = String(body.campaignId || url.searchParams.get("campaignId") || "").trim();
  const keywordId = String(body.keywordId || url.searchParams.get("keywordId") || "").trim();
  if (!campaignId) return NextResponse.json({ error: "삭제할 광고를 선택하세요." }, { status: 400 });
  try {
    if (keywordId) {
      const result = await deleteHubKeyword(campaignId, keywordId);
      if (!result.ok || !result.campaign) {
        return NextResponse.json({ error: "키워드를 찾지 못했습니다." }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        campaign: campaignPayload(result.campaign),
        campaigns: result.campaigns.map((row) => campaignPayload(row)),
      });
    }
    const result = await deleteHubCampaign(campaignId);
    if (!result.ok) return NextResponse.json({ error: "광고를 찾지 못했습니다." }, { status: 404 });
    return NextResponse.json({
      ok: true,
      campaigns: result.campaigns.map((row) => campaignPayload(row)),
    });
  } catch (err) {
    return persistFail(err);
  }
}
