import {
  HUB_TICK_SOLO,
  HUB_TICK_WITH_BULK,
  appendCampaignKeywords,
  assignNextSite,
  hubBoardTodaySummary,
  hubTodayProgress,
  parseHubCampaign,
  parseHubCampaigns,
  pickHubTickKeywords,
  planHubCampaign,
  reclaimStaleHubKeywords,
  type HubBoardCampaign,
} from "../src/lib/hub-board";
import type { OpsSite } from "../src/lib/ops-ledger";
import { listHubBoardTemplates, renderHubBoardTemplateArticle } from "../src/lib/hub-board-templates";
import type { Settings } from "../src/lib/types";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function sample(partial: Record<string, unknown> = {}): HubBoardCampaign {
  const parsed = parseHubCampaign({
    id: "c1",
    title: "자유게시판 광고",
    vendorName: "아가펫",
    vendorId: "v1",
    dailyLimit: 100,
    siteIds: ["s1"],
    schedule: { enabled: true, startHour: 9, endHour: 23 },
    createdAt: "2026-09-10T00:00:00.000Z",
    keywords: [],
    ...partial,
  });
  if (!parsed) throw new Error("failed to parse sample campaign");
  return parsed;
}

assert(HUB_TICK_SOLO === 16, "solo tick publishes 16 per campaign");
assert(HUB_TICK_WITH_BULK === 6, "bulk tick publishes 6 hub ads total");
assert(HUB_TICK_SOLO * 10 >= 150, "10 hub ticks cover a real daily cap per campaign");

const replaced = parseHubCampaign({ vendorName: "새업체", vendorId: "v2", vendorPhone: "010-1111-2222" }, sample());
assert(replaced?.vendorName === "새업체", "vendor name can be replaced");
assert(replaced?.vendorId === "v2", "vendor id can be replaced");
assert(replaced?.vendorPhone === "010-1111-2222", "vendor phone can be replaced");

const kept = parseHubCampaign({ title: "이름만 바꿈" }, sample({ vendorName: "아가펫", vendorId: "v1" }));
assert(kept?.vendorName === "아가펫", "omitted vendor keeps current");

const appended = appendCampaignKeywords(sample({ keywords: [{ id: "k1", keyword: "부천 미용", status: "queued" }] }), [
  "부천 미용",
  "인천 펫샵",
]);
assert(appended.added === 1, "skips duplicate keyword");
assert(appended.campaign.keywords.length === 2, "adds the new keyword");
assert(appended.campaign.topKeyword === "부천 미용", "keeps first keyword as top");
assert(appended.campaign.keywordCount === 2, "keyword count follows the list");

const now = new Date("2026-09-14T03:00:00.000Z"); // 12:00 Seoul
const dueAt = new Date("2026-09-14T01:00:00.000Z").toISOString();
const laterToday = new Date("2026-09-14T10:00:00.000Z").toISOString();
const campaign = sample({
  keywords: [
    { id: "due", keyword: "지금", status: "scheduled", scheduledAt: dueAt },
    { id: "later", keyword: "저녁", status: "scheduled", scheduledAt: laterToday },
    { id: "wait", keyword: "대기", status: "queued" },
    {
      id: "done",
      keyword: "완료",
      status: "published",
      publishedAt: "2026-09-14T00:30:00.000Z",
    },
  ],
});

const picked = pickHubTickKeywords([campaign], 4, now);
assert(picked[0]?.keyword.id === "due", "due keyword comes first");
assert(picked.some((row) => row.keyword.id === "later"), "today's remaining scheduled ads are not left until night");
assert(!picked.some((row) => row.keyword.id === "wait"), "queued ads wait for planning");
assert(picked.length === 2, "only due + remaining scheduled today");

const other = sample({
  id: "c2",
  vendorName: "다른업체",
  keywords: [
    { id: "b1", keyword: "추가1", status: "scheduled", scheduledAt: dueAt },
    { id: "b2", keyword: "추가2", status: "scheduled", scheduledAt: dueAt },
    { id: "b3", keyword: "추가3", status: "scheduled", scheduledAt: dueAt },
    { id: "b4", keyword: "추가4", status: "scheduled", scheduledAt: laterToday },
  ],
});
const firstHeavy = sample({
  id: "c1-heavy",
  keywords: [
    { id: "a1", keyword: "기존1", status: "scheduled", scheduledAt: dueAt },
    { id: "a2", keyword: "기존2", status: "scheduled", scheduledAt: dueAt },
    { id: "a3", keyword: "기존3", status: "scheduled", scheduledAt: dueAt },
    { id: "a4", keyword: "기존4", status: "scheduled", scheduledAt: dueAt },
  ],
});
const independent = pickHubTickKeywords([firstHeavy, other], 3, now);
assert(independent.filter((row) => row.campaign.id === "c1-heavy").length === 3, "first ad still gets its own 3");
assert(independent.filter((row) => row.campaign.id === "c2").length === 3, "extra vendor ad gets its own 3");
assert(independent.length === 6, "extra ads do not share one tick pile");
assert(independent[0].campaign.id !== independent[1].campaign.id, "campaigns take turns so one does not block the other");
const shared = pickHubTickKeywords([firstHeavy, other], 3, now, 6);
assert(shared.length === 6, "optional total cap still allows both campaigns when it fits");
const bulkShared = pickHubTickKeywords([firstHeavy, other], 16, now, 6);
assert(bulkShared.length === 6, "bulk flush keeps a small shared cap");
assert(bulkShared.some((row) => row.campaign.id === "c2"), "bulk flush still gives the extra ad a turn");

const progress = hubTodayProgress(campaign, now);
assert(progress.publishedToday === 1, "counts published today");
assert(progress.scheduledToday === 2, "counts remaining scheduled today");
assert(progress.waiting === 1, "counts queued");
assert(progress.dailyLimit === 100, "exposes daily cap");
assert(progress.remainingToday === 97, "remaining is cap minus published and scheduled");
assert(progress.topKeyword === "지금", "uses the first remaining keyword as top");

const summary = hubBoardTodaySummary(
  [
    campaign,
    sample({
      id: "c2",
      dailyLimit: 20,
      keywords: [{ id: "x", keyword: "다른업체", status: "queued" }],
    }),
  ],
  now
);
assert(summary.dailyLimit === 120, "sums daily caps");
assert(summary.publishedToday === 1, "sums published");
assert(summary.waiting === 2, "sums waiting");

const listed = parseHubCampaigns([campaign, { vendorName: "" }]);
assert(listed.length >= 1, "parseHubCampaigns keeps campaigns");
assert(listed[0].keywordCount >= listed[0].keywords.length, "listed count does not shrink below remaining keywords");

const stale = sample({
  siteIds: ["s1", "s2"],
  dailyLimit: 2,
  keywords: [
    {
      id: "old1",
      keyword: "어제1",
      status: "scheduled",
      siteId: "s1",
      domain: "a.example",
      scheduledAt: "2026-09-13T10:00:00.000Z",
    },
    {
      id: "old2",
      keyword: "어제2",
      status: "scheduled",
      siteId: "s2",
      domain: "b.example",
      scheduledAt: "2026-09-13T12:00:00.000Z",
    },
    { id: "fresh", keyword: "오늘대기", status: "queued" },
  ],
});
const sites: OpsSite[] = [
  {
    id: "s1",
    domain: "a.example",
    apexDomain: "example",
    boardAdsConsent: true,
  } as OpsSite,
  {
    id: "s2",
    domain: "b.example",
    apexDomain: "example",
    boardAdsConsent: true,
  } as OpsSite,
];
const reclaimed = reclaimStaleHubKeywords(stale, "2026-09-14", now);
assert(reclaimed.reclaimed === 2, "yesterday leftovers return to queue");
assert(
  reclaimed.campaign.keywords.filter((row) => row.status === "queued").length === 3,
  "stale + fresh are all queued after reclaim"
);
const plannedDay = planHubCampaign(reclaimed.campaign, sites, now);
assert(plannedDay.planned === 2, "new Seoul day plans only up to dailyLimit, not stacked leftovers");
assert(
  plannedDay.campaign.keywords.filter((row) => row.status === "scheduled").length === 2,
  "planned keywords become scheduled"
);
assert(
  plannedDay.campaign.keywords.every(
    (row) => row.status !== "scheduled" || (row.scheduledAt && row.scheduledAt.startsWith("2026-09-14"))
  ),
  "new slots land on today's Seoul calendar day"
);

// Old clamp put leftovers at next-day 00:00 KST (= 15:00Z prior day). Those must be released and re-spread.
const midnightPile = sample({
  dailyLimit: 4,
  schedule: { enabled: true, startHour: 1, endHour: 23, planDate: "2026-09-14" },
  keywords: [
    {
      id: "done",
      keyword: "이미발행",
      status: "published",
      publishedAt: "2026-09-14T02:00:00.000Z",
    },
    {
      id: "mid1",
      keyword: "자정1",
      status: "scheduled",
      scheduledAt: "2026-09-14T15:00:00.000Z", // 09-15 00:00 KST
    },
    {
      id: "mid2",
      keyword: "자정2",
      status: "scheduled",
      scheduledAt: "2026-09-14T15:00:00.000Z",
    },
    {
      id: "mid3",
      keyword: "자정3",
      status: "scheduled",
      scheduledAt: "2026-09-14T15:00:00.000Z",
    },
  ],
});
const redistributed = planHubCampaign(midnightPile, sites, now);
assert(redistributed.planned === 3, "next-day 00:00 pile is released and re-planned");
const midSlots = redistributed.campaign.keywords
  .filter((row) => row.id.startsWith("mid") && row.status === "scheduled")
  .map((row) => row.scheduledAt || "")
  .sort();
assert(midSlots.length === 3, "three midnight leftovers become scheduled again");
assert(
  midSlots.every((iso) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(iso));
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    return `${y}-${m}-${d}` === "2026-09-14";
  }),
  "re-spread slots stay on today's Seoul calendar day"
);
assert(
  midSlots.every((iso) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(iso));
    const hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
    return hour !== 0;
  }),
  "re-spread slots are not stuck at Seoul midnight"
);
assert(new Set(midSlots).size >= 2, "even spread does not pile every slot on one timestamp");
const midTimes = midSlots.map((iso) => new Date(iso).getTime());
assert(midTimes[0] < midTimes[midTimes.length - 1] || midSlots.length === 1, "slots are ordered across the window");

const assigned = assignNextSite(
  sample({ siteIds: ["s1", "s2"], nextSiteIndex: 0 }),
  { id: "k", keyword: "랜덤", status: "queued" },
  sites
);
assert(assigned.site.id === "s1" || assigned.site.id === "s2", "unplanned keyword gets a consented site");
assert(Boolean(assigned.keyword.siteId), "site id is stored on the keyword");

const noConsentSites: OpsSite[] = sites.map((site) => ({ ...site, boardAdsConsent: false }));
const assignedWithoutConsent = assignNextSite(
  sample({ siteIds: ["s1"], keywords: [{ id: "k-nc", keyword: "동의없음", status: "scheduled", siteId: "s1", domain: "a.test" }] }),
  { id: "k-nc", keyword: "동의없음", status: "scheduled", siteId: "s1", domain: "a.test" },
  noConsentSites
);
assert(assignedWithoutConsent.site.id === "s1", "already-assigned keyword still publishes when consent is off");

const staleSites = sample({
  siteIds: ["gone-id"],
  dailyLimit: 2,
  keywords: [
    { id: "q1", keyword: "부천", status: "queued" },
    { id: "q2", keyword: "인천", status: "queued" },
  ],
});
const recovered = planHubCampaign(staleSites, sites, now);
assert(recovered.planned === 2, "stale site ids fall back to consented sites");
assert(recovered.campaign.keywords.every((row) => row.domain), "fallback assigns domains");

const parsedMode = parseHubCampaign({
  title: "템플릿광고",
  contentMode: "template",
  templateId: "goldendoodle-adoption",
  vendorName: "오케이독",
  dailyLimit: 10,
  siteIds: ["s1"],
  keywords: [],
});
assert(parsedMode?.contentMode === "template", "contentMode template is preserved");
assert(parsedMode?.templateId === "goldendoodle-adoption", "templateId is preserved");
assert(parseHubCampaign({ title: "기본" })?.contentMode === "gemini", "contentMode defaults to gemini");

assert(listHubBoardTemplates().some((row) => row.id === "goldendoodle-adoption"), "goldendoodle template is registered");
assert(listHubBoardTemplates().length >= 20, "multiple hub templates are registered");
assert(listHubBoardTemplates().some((row) => row.id === "dog-adoption"), "dog-adoption template is registered");
assert(listHubBoardTemplates().some((row) => row.id === "dog-rehome"), "dog-rehome template is registered");

async function verifyTemplates() {
  const tplCampaign = sample({
    contentMode: "template",
    templateId: "goldendoodle-adoption",
    vendorName: "오케이독 부천본점",
    vendorPhone: "0505-464-1004",
    keywords: [{ id: "k-tpl", keyword: "부천 골든두들분양", status: "queued" }],
  });
  const tplSite = sites[0];
  const settings = {
    geminiApiKey: "",
    geminiModel: "",
    siteName: "테스트",
    siteTagline: "",
    publishBannedKeywords: [],
  } as Settings;
  const rendered = await renderHubBoardTemplateArticle(tplCampaign, tplCampaign.keywords[0], tplSite, settings);
  assert(rendered.title.includes("부천") || rendered.title.includes("골든두들"), "template title uses place/topic");
  assert(/STEP|골든두들|품종/.test(rendered.bodyHtml), "template body has breed depth");
  assert(String(rendered.vendorName).includes("오케이독"), "vendor name is kept");
  assert(!String(rendered.bodyHtml).includes("{{"), "placeholders are substituted");

  const tplOther = await renderHubBoardTemplateArticle(
    {
      ...tplCampaign,
      id: "c-other",
      keywords: [{ id: "k-tpl2", keyword: "인천 골든두들분양", status: "queued" }],
    },
    { id: "k-tpl2", keyword: "인천 골든두들분양", status: "queued" },
    { ...tplSite, id: "s2", domain: "b.example" },
    settings
  );
  assert(tplOther.title !== rendered.title, "different regions get different titles");
  assert(tplOther.bodyHtml.includes("인천") || tplOther.title.includes("인천"), "other region is reflected");
  // Shared breed knowledge is intentional; uniqueness relies on place/vendor/variant + site-local avoid lists.
  assert(rendered.bodyHtml !== tplOther.bodyHtml, "bodies are not byte-identical across regions");
}

verifyTemplates()
  .then(() => {
    console.log("verify-hub-board ok");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
