"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ARTICLE_STYLE_OPTIONS } from "@/lib/article-style";
import { VendorPicker } from "@/components/admin/VendorPicker";
import { MultiFileButton } from "@/components/admin/MultiFileButton";
import { pickImageFiles, prepareUploadImage } from "@/lib/prepare-upload-image";
import { mergeImageUrls } from "@/lib/image-pool";
import { defaultHubBoardTemplateId, listHubBoardTemplates } from "@/lib/hub-board-templates/registry";

const HUB_TEMPLATES = listHubBoardTemplates();
const DEFAULT_TEMPLATE_ID = defaultHubBoardTemplateId();

type BoardSite = { id: string; siteName: string; domain: string; apexDomain: string; concept?: string };

type Keyword = {
  id: string;
  keyword: string;
  status: string;
  siteId?: string;
  domain?: string;
  error?: string;
  title?: string;
  scheduledAt?: string;
  publishedAt?: string;
  youtubeUrl1?: string;
  youtubeUrl2?: string;
};

type CampaignToday = {
  today: string;
  publishedToday: number;
  scheduledToday: number;
  waiting: number;
  dailyLimit: number;
  remainingToday: number;
  keywordCount: number;
  topKeyword: string;
  date: string;
};

type Campaign = {
  id: string;
  title: string;
  vendorName?: string;
  vendorPhone?: string;
  vendorWebsite?: string;
  vendorKakao?: string;
  vendorId?: string;
  writingStyle?: string;
  contentMode?: "gemini" | "template";
  templateId?: string;
  imagePool?: string[];
  imageFolderUrl?: string;
  imageCountMin?: number;
  imageCountMax?: number;
  extraPrompt?: string;
  dailyLimit: number;
  siteIds: string[];
  keywords: Keyword[];
  schedule: { enabled: boolean; startHour: number };
  stats?: { total: number; published: number; remaining: number; percent: number; daysLeft: number };
  today?: CampaignToday;
  createdAt?: string;
  updatedAt?: string;
  topKeyword?: string;
  keywordCount?: number;
  vendorRecruitSlot?: boolean;
  youtubeUrl1?: string;
  youtubeUrl2?: string;
};

const HOURS = Array.from({ length: 23 }, (_, i) => i + 1);

function emptyCampaign(siteIds: string[]): Campaign {
  return {
    id: "",
    title: "",
    vendorName: "",
    vendorPhone: "",
    vendorWebsite: "",
    vendorKakao: "",
    vendorId: "",
    writingStyle: "random",
    contentMode: "gemini",
    templateId: DEFAULT_TEMPLATE_ID,
    imagePool: [],
    imageFolderUrl: "",
    imageCountMin: 1,
    imageCountMax: 3,
    extraPrompt: "",
    dailyLimit: 100,
    siteIds,
    keywords: [],
    schedule: { enabled: true, startHour: 9 },
    vendorRecruitSlot: false,
    youtubeUrl1: "",
    youtubeUrl2: "",
  };
}

function campaignSaveBody(campaign: Campaign, extraText = "") {
  return {
    id: campaign.id || undefined,
    title: campaign.title || campaign.vendorName || "자유게시판 광고",
    vendorName: campaign.vendorName || "",
    vendorPhone: campaign.vendorPhone || "",
    vendorWebsite: campaign.vendorWebsite || "",
    vendorKakao: campaign.vendorKakao || "",
    vendorId: campaign.vendorId || "",
    youtubeUrl1: campaign.youtubeUrl1,
    youtubeUrl2: campaign.youtubeUrl2,
    imagePool: campaign.imagePool || [],
    imageFolderUrl: campaign.imageFolderUrl || "",
    imageCountMin: campaign.imageCountMin || 1,
    imageCountMax: Math.max(campaign.imageCountMin || 1, campaign.imageCountMax || 3),
    extraPrompt: campaign.extraPrompt || "",
    coverImage: (campaign.imagePool || [])[0] || "",
    writingStyle: campaign.writingStyle,
    contentMode: campaign.contentMode || "gemini",
    templateId: campaign.contentMode === "template" ? campaign.templateId || DEFAULT_TEMPLATE_ID : campaign.templateId,
    dailyLimit: campaign.dailyLimit,
    siteIds: campaign.siteIds,
    keywords: campaign.keywords,
    schedule: campaign.schedule,
    vendorRecruitSlot: Boolean(campaign.vendorRecruitSlot),
    text: extraText,
  };
}

function listTopKeyword(campaign: Campaign) {
  return campaign.today?.topKeyword || campaign.topKeyword || campaign.keywords[0]?.keyword?.trim() || "—";
}

function listKeywordCount(campaign: Campaign) {
  return campaign.today?.keywordCount || campaign.keywordCount || campaign.keywords.length;
}

function listDate(campaign: Campaign) {
  const key = campaign.today?.date || seoulDayKey(campaign.createdAt) || seoulDayKey(campaign.updatedAt);
  return key || "—";
}

function statusLabel(status: string) {
  if (status === "published") return "발행";
  if (status === "scheduled") return "예약";
  if (status === "processing") return "작성중";
  if (status === "failed") return "실패";
  return "대기";
}

function formatScheduleTime(iso?: string) {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ts));
}

function seoulTodayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function seoulDayKey(iso?: string) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

const PAGE_SIZE = 10;

function PageNav({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
  if (pages <= 1) return null;
  return (
    <div className="admin-pager">
      {Array.from({ length: pages }, (_, i) => i + 1).map((num) => (
        <button
          key={num}
          type="button"
          className={`admin-page-btn${num === page ? " active" : ""}`}
          onClick={() => onChange(num)}
        >
          {num}
        </button>
      ))}
      <span className="admin-page-ellipsis">
        {total}개 · {page}/{pages}페이지
      </span>
    </div>
  );
}

export function HubBoardAds() {
  const [sites, setSites] = useState<BoardSite[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [form, setForm] = useState<Campaign>(emptyCampaign([]));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [nowId, setNowId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sitesOpen, setSitesOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [folderBusy, setFolderBusy] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [donePage, setDonePage] = useState(1);
  const [listPage, setListPage] = useState(1);
  const [extras, setExtras] = useState<Campaign[]>([]);
  const [extraTexts, setExtraTexts] = useState<string[]>([]);
  const formCardRef = useRef<HTMLFormElement | null>(null);
  const draftingRef = useRef(false);
  const [today, setToday] = useState<{
    date: string;
    publishedToday: number;
    scheduledToday: number;
    waiting: number;
    dailyLimit: number;
    remainingToday: number;
  } | null>(null);

  async function load(preferredId?: string, opts?: { force?: boolean }) {
    const res = await fetch(`/api/ops/board-campaigns${opts?.force === false ? "" : "?force=1"}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "불러오기 실패");
    const nextSites: BoardSite[] = data.sites || [];
    const nextCampaigns: Campaign[] = data.campaigns || [];
    setSites(nextSites);
    setCampaigns(nextCampaigns);
    setToday(data.today || null);
    if (Number(data.planned) > 0) {
      setMessage(
        `오늘 예약 ${data.planned}건을 광고별로 다시 잡았습니다. 「대기 발행 실행」으로 바로 쓸 수 있습니다.`
      );
    } else if (Array.isArray(data.planReasons) && data.planReasons.length) {
      const tip = String(data.planReasons[0] || "");
      if (tip.includes("no-sites")) {
        setMessage("발행할 사이트가 없습니다. 사이트 대장에서 광고글 동의를 켜 주세요.");
      } else if (tip.includes("limit")) {
        setMessage("오늘 하루 한도를 이미 다 써서 추가 배정이 없습니다.");
      } else if (Number(data.consentedCount) === 0 && Number(data.siteCount) > 0) {
        setMessage("사이트는 있지만 광고글 동의가 없습니다. 대장에서 동의를 켜 주세요.");
      } else {
        setMessage("오늘 새로 배정할 대기 키워드가 없거나, 이미 예약된 상태입니다.");
      }
    }
    // Keep blank "새 광고" form — never let a stale load() yank back into an existing campaign.
    if (draftingRef.current) {
      return { sites: nextSites, campaigns: nextCampaigns };
    }
    const keepId = preferredId;
    const selected =
      (keepId && nextCampaigns.find((row) => row.id === keepId)) ||
      nextCampaigns.find((row) =>
        row.keywords.some((k) => k.status === "queued" || k.status === "scheduled" || k.status === "processing")
      ) ||
      nextCampaigns[0];
    if (selected) {
      setForm(selected);
    } else setForm(emptyCampaign(nextSites.map((site) => site.id)));
    return { sites: nextSites, campaigns: nextCampaigns };
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "불러오기 실패"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hubCatchupOn = campaigns.some(
    (campaign) =>
      campaign.schedule.enabled &&
      campaign.keywords.some(
        (row) => row.status === "queued" || row.status === "scheduled" || row.status === "processing"
      )
  );

  useEffect(() => {
    if (!hubCatchupOn || !form.id || draftingRef.current) return;
    const campaignId = form.id;
    let cancelled = false;
    const tick = () => {
      if (draftingRef.current || cancelled) return;
      fetch("/api/cron/hub-board", { method: "POST" })
        .then(() => (cancelled || draftingRef.current ? null : load(campaignId)))
        .catch(() => undefined);
    };
    tick();
    const timer = window.setInterval(tick, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [form.id, hubCatchupOn]);

  const grouped = useMemo(() => {
    const map = new Map<string, BoardSite[]>();
    for (const site of sites) {
      const key = site.apexDomain || site.domain;
      const rows = map.get(key) || [];
      rows.push(site);
      map.set(key, rows);
    }
    return [...map.entries()];
  }, [sites]);

  const todayKey = seoulTodayKey();
  const activeKeywords = useMemo(
    () =>
      form.keywords.filter(
        (row) => row.status === "queued" || row.status === "scheduled" || row.status === "processing" || row.status === "failed"
      ),
    [form.keywords]
  );
  const doneToday = useMemo(
    () =>
      form.keywords.filter((row) => {
        if (row.status !== "published") return false;
        const day = seoulDayKey(row.publishedAt || row.scheduledAt);
        return Boolean(day && day === todayKey);
      }),
    [form.keywords, todayKey]
  );
  const activeSlice = activeKeywords.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const doneSlice = doneToday.slice((donePage - 1) * PAGE_SIZE, donePage * PAGE_SIZE);
  const listSlice = campaigns.slice((listPage - 1) * PAGE_SIZE, listPage * PAGE_SIZE);

  useEffect(() => {
    setActivePage(1);
    setDonePage(1);
  }, [form.id]);

  useEffect(() => {
    const max = Math.max(1, Math.ceil(campaigns.length / PAGE_SIZE) || 1);
    if (listPage > max) setListPage(max);
  }, [campaigns.length, listPage]);

  useEffect(() => {
    const max = Math.max(1, Math.ceil(activeKeywords.length / PAGE_SIZE) || 1);
    if (activePage > max) setActivePage(max);
  }, [activeKeywords.length, activePage]);

  useEffect(() => {
    const max = Math.max(1, Math.ceil(doneToday.length / PAGE_SIZE) || 1);
    if (donePage > max) setDonePage(max);
  }, [doneToday.length, donePage]);

  const perSiteHint = useMemo(() => {
    const n = Math.max(1, form.siteIds.length || 1);
    const total = Math.max(1, form.dailyLimit || 1);
    if (total >= 9999) return "사실상 무제한";
    const base = Math.floor(total / n);
    const rem = total % n;
    return n > 1
      ? `전체 ${total}개 · 사이트 ${n}개 → 대략 각 ${base}개${rem ? ` (앞 ${rem}곳은 +1)` : ""}`
      : `하루 ${total}개`;
  }, [form.dailyLimit, form.siteIds.length]);

  async function importFolder() {
    const folder = (form.imageFolderUrl || "").trim();
    if (!folder) {
      setError("웹 폴더 주소를 넣으세요.");
      return;
    }
    setFolderBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/bulk/folder-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: folder }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "폴더를 읽지 못했습니다.");
      const added = Array.isArray(data.urls) ? data.urls.map((item: unknown) => String(item || "")).filter(Boolean) : [];
      setForm((prev) => ({ ...prev, imagePool: mergeImageUrls(prev.imagePool || [], added) }));
      setMessage(`${added.length}장을 폴더에서 가져왔습니다. 아래 저장을 눌러 캠페인에 남기세요.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "폴더를 읽지 못했습니다.");
    } finally {
      setFolderBusy(false);
    }
  }

  function toggleSite(id: string) {
    setForm((prev) => ({
      ...prev,
      siteIds: prev.siteIds.includes(id) ? prev.siteIds.filter((row) => row !== id) : [...prev.siteIds, id],
    }));
  }

  async function openCampaign(campaign: Campaign) {
    draftingRef.current = false;
    setBusy(true);
    setText("");
    setExtras([]);
    setExtraTexts([]);
    setError("");
    setMessage("");
    setForm(campaign);
    try {
      const res = await fetch("/api/ops/board-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "plan", campaignId: campaign.id, force: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "배정 실패");
      if (Array.isArray(data.campaigns)) setCampaigns(data.campaigns);
      if (data.campaign) setForm(data.campaign);
      if (Number(data.planned) > 0) {
        setMessage(`이 광고 오늘 예약 ${data.planned}건 배정 · 사이트/시간이 붙었습니다.`);
      } else if (data.reason === "no-sites") {
        setMessage("이 광고에 쓸 사이트가 없습니다. 아래에서 사이트를 고르거나 대장 동의를 켜 주세요.");
      } else if (data.reason === "limit") {
        setMessage("이 광고는 오늘 한도를 이미 채웠습니다.");
      } else if (data.reason === "empty") {
        setMessage("이 광고에 배정 대기 키워드가 없습니다. 이미 예약됐거나 모두 발행됐을 수 있습니다.");
      } else {
        setMessage("이 광고 배정을 확인했습니다.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "배정 실패");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCampaign(campaignId: string) {
    if (!campaignId) return;
    if (!confirm("이 자유게시판 광고를 삭제할까요? 대기·예약 키워드도 함께 사라집니다.")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/ops/board-campaigns", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "삭제 실패");
      const next = (data.campaigns || []) as Campaign[];
      setCampaigns(next);
      setMessage("광고를 삭제했습니다.");
      if (form.id === campaignId) {
        draftingRef.current = false;
        if (next[0]) setForm(next[0]);
        else setForm(emptyCampaign(sites.map((site) => site.id)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  async function deleteKeyword(keywordId: string) {
    if (!form.id || !keywordId) return;
    if (!confirm("이 키워드 예약을 삭제할까요?")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/ops/board-campaigns", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: form.id, keywordId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "삭제 실패");
      if (Array.isArray(data.campaigns)) setCampaigns(data.campaigns);
      if (data.campaign) setForm(data.campaign);
      setMessage("키워드를 삭제했습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  function startNew() {
    draftingRef.current = true;
    setForm(emptyCampaign(sites.map((site) => site.id)));
    setText("");
    setExtras([]);
    setExtraTexts([]);
    setError("");
    setMessage("새 광고를 작성 중입니다. 저장하면 목록에 추가됩니다.");
    setActivePage(1);
    setDonePage(1);
    window.requestAnimationFrame(() => {
      formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function addExtra() {
    const siteIds = form.siteIds.length ? form.siteIds : sites.map((site) => site.id);
    setExtras((prev) => [
      ...prev,
      {
        ...emptyCampaign(siteIds),
        writingStyle: form.writingStyle,
        contentMode: form.contentMode || "gemini",
        templateId: form.templateId || DEFAULT_TEMPLATE_ID,
        extraPrompt: form.extraPrompt,
        imagePool: form.imagePool || [],
        imageFolderUrl: form.imageFolderUrl || "",
        imageCountMin: form.imageCountMin || 1,
        imageCountMax: form.imageCountMax || 3,
        schedule: { ...form.schedule },
        vendorRecruitSlot: Boolean(form.vendorRecruitSlot),
      },
    ]);
    setExtraTexts((prev) => [...prev, ""]);
  }

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const extraItems = extras
        .map((row, index) => ({ row, extraText: extraTexts[index] || "" }))
        .filter(({ row, extraText }) => row.vendorName || extraText.trim() || row.keywords.length)
        .map(({ row, extraText }) => campaignSaveBody(row, extraText));
      const items = [campaignSaveBody(form, text), ...extraItems];
      const res = await fetch("/api/ops/board-campaigns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "저장 실패");
      setText("");
      setExtras([]);
      setExtraTexts([]);
      const savedId = String(data.campaigns?.[0]?.id || data.campaign?.id || form.id || "");
      draftingRef.current = false;
      const fresh = await load(savedId || undefined);
      const saved = fresh.campaigns.find((row) => row.id === savedId) || data.campaign;
      if (saved) setForm(saved);
      const count = Array.isArray(data.campaigns) ? data.campaigns.length : 1;
      setMessage(
        data.planned
          ? `광고 ${count}개를 저장했습니다. 오늘 분량 ${data.planned}건을 예약했습니다. 이미 나간 글의 업체는 그대로이고, 앞으로 나가는 글부터 바뀝니다.`
          : count > 1
            ? `광고 ${count}개를 저장했습니다. 각각 다른 업체로 등록됩니다.`
            : "키워드와 설정을 저장했습니다. 이미 나간 글의 업체는 그대로이고, 앞으로 나가는 글부터 바뀝니다."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  async function runTick() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/cron/hub-board", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "실행 실패");
      const done = (data.results || []).filter((row: { ok: boolean }) => row.ok).length;
      const fail = (data.results || []).filter((row: { ok: boolean }) => !row.ok).length;
      setMessage(
        data.processed
          ? `순차 발행 ${data.processed}건 · 성공 ${done} · 실패 ${fail}`
          : data.planned
            ? `오늘 분량 ${data.planned}건을 예약했습니다.`
            : "지금은 발행할 예약이 없습니다."
      );
      await load(form.id || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "실행 실패");
    } finally {
      setBusy(false);
    }
  }

  async function publishNow(keywordId: string) {
    if (!form.id) {
      setError("먼저 저장하세요.");
      return;
    }
    setNowId(keywordId);
    setError("");
    setMessage("");
    try {
      const persist = await fetch("/api/ops/board-campaigns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          title: form.title || form.vendorName || "자유게시판 광고",
          vendorName: form.vendorName,
          vendorPhone: form.vendorPhone,
          vendorWebsite: form.vendorWebsite,
          vendorKakao: form.vendorKakao,
          vendorId: form.vendorId,
          youtubeUrl1: form.youtubeUrl1,
          youtubeUrl2: form.youtubeUrl2,
          imagePool: form.imagePool || [],
          imageFolderUrl: form.imageFolderUrl || "",
          imageCountMin: form.imageCountMin || 1,
          imageCountMax: form.imageCountMax || 3,
          extraPrompt: form.extraPrompt || "",
          coverImage: (form.imagePool || [])[0] || "",
          writingStyle: form.writingStyle,
          contentMode: form.contentMode || "gemini",
          templateId: form.contentMode === "template" ? form.templateId || DEFAULT_TEMPLATE_ID : form.templateId,
          dailyLimit: form.dailyLimit,
          siteIds: form.siteIds,
          keywords: form.keywords,
          schedule: form.schedule,
          vendorRecruitSlot: Boolean(form.vendorRecruitSlot),
        }),
      });
      const persisted = await persist.json();
      if (!persist.ok) throw new Error(persisted.error || "저장 실패");
      if (persisted.campaign) setForm(persisted.campaign);
      const res = await fetch("/api/ops/board-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: form.id, keywordId }),
      });
      const data = await res.json();
      if (!res.ok) {
        const tip = String(data.error || "");
        if (tip.includes("마스터")) {
          throw new Error("마스터 잠금이 풀렸습니다. 페이지를 새로고침한 뒤 마스터 비밀번호로 다시 열어 주세요.");
        }
        throw new Error(tip || "발행 실패");
      }
      setMessage(`${data.keyword} → ${data.domain} 자유게시판에 등록했습니다.`);
      if (data.campaign) setForm(data.campaign);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "발행 실패");
    } finally {
      setNowId("");
    }
  }

  const saveLabel = extras.length ? `모두 저장 (${extras.length + 1}개)` : "저장";

  return (
    <div className="hub-board">
      <div className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>자유게시판 광고 목록</h2>
            <p className="field-hint" style={{ marginTop: 0 }}>
              줄을 누르면 그 광고를 고칩니다. 업체도 바꿀 수 있습니다. 「다른 업체로 하나 더」로 한 번에 여러 광고를 넣고
              모두 저장하세요.
            </p>
          </div>
        </div>
        {today ? (
          <p className="field-hint">
            오늘({today.date}) 발행 {today.publishedToday} / 한도 합계 {today.dailyLimit} · 오늘 예약 {today.scheduledToday} ·
            남은 오늘 {today.remainingToday} · 대기 {today.waiting}
          </p>
        ) : null}
        <div className="admin-actions hub-board-toolbar">
          <button className="btn" type="button" onClick={startNew}>
            새 광고
          </button>
          <button className="btn btn-ghost" type="button" onClick={addExtra}>
            다른 업체로 하나 더
          </button>
        </div>
        <div className="table-wrap">
          <table className="admin-table hub-board-table">
            <thead>
              <tr>
                <th>번호</th>
                <th>날짜</th>
                <th>최상단키워드</th>
                <th>개수</th>
                <th>업체명</th>
                <th>삭제</th>
              </tr>
            </thead>
            <tbody>
              {listSlice.length ? (
                listSlice.map((campaign, index) => (
                  <tr
                    key={campaign.id}
                    className={form.id && form.id === campaign.id ? "is-selected" : undefined}
                    onClick={() => openCampaign(campaign)}
                  >
                    <td>{(listPage - 1) * PAGE_SIZE + index + 1}</td>
                    <td>{listDate(campaign)}</td>
                    <td>{listTopKeyword(campaign)}</td>
                    <td>{listKeywordCount(campaign)}</td>
                    <td>{campaign.vendorName || campaign.title || "—"}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        disabled={busy}
                        onClick={() => deleteCampaign(campaign.id)}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="muted">
                    아직 등록한 광고가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PageNav page={listPage} total={campaigns.length} onChange={setListPage} />
      </div>

      <form className="admin-card admin-form" onSubmit={save} ref={formCardRef}>
        <div className="admin-card-head">
          <div>
            <h2>{form.id ? "자유게시판 광고 수정" : "자유게시판 광고 등록"}</h2>
            <p className="field-hint" style={{ marginTop: 0 }}>
              키워드마다 제미나이가 다른 글을 만들고, 동의한 사이트 중 랜덤으로 넣습니다(지역이 한 사이트에 몰리지 않게).
              글방향은 이 화면 설정이 모든 키워드에 공통입니다. 말투·페르소나·사이트 이름·컨셉은 글을 받는 그 사이트 설정을 따릅니다.
              자동발행을 켜 두면 이 화면을 열거나 새로고침할 때 어제 미발행을 오늘로 다시 잡고, Production cron이 발행합니다.
              업체를 바꿔 저장하면 이미 나간 글은 그대로이고, 앞으로 나가는 글부터 새 업체가 붙습니다.
            </p>
          </div>
        </div>

        {extras.map((row, index) => (
          <section key={`extra-${index}`} className="hub-board-extra">
            <div className="hub-board-form-head">
              <h3>추가 광고 {index + 1}</h3>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setExtras((current) => current.filter((_, i) => i !== index));
                  setExtraTexts((current) => current.filter((_, i) => i !== index));
                }}
              >
                빼기
              </button>
            </div>
            <div className="hub-board-vendor">
              <div>
                <label>업체명</label>
                <input
                  value={row.vendorName || ""}
                  onChange={(e) =>
                    setExtras((current) =>
                      current.map((item, i) => (i === index ? { ...item, vendorName: e.target.value } : item))
                    )
                  }
                />
              </div>
              <VendorPicker
                onPick={(fields) =>
                  setExtras((current) =>
                    current.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            vendorId: fields.vendorId,
                            vendorName: fields.vendorName,
                            vendorPhone: fields.vendorPhone,
                            vendorWebsite: fields.vendorWebsite,
                            vendorKakao: fields.vendorKakao,
                            title: item.title || fields.vendorName,
                          }
                        : item
                    )
                  )
                }
              />
            </div>
            <label>전화</label>
            <input
              value={row.vendorPhone || ""}
              onChange={(e) =>
                setExtras((current) =>
                  current.map((item, i) => (i === index ? { ...item, vendorPhone: e.target.value } : item))
                )
              }
            />
            <label>하루 전체 발행 수량</label>
            <input
              type="number"
              min={1}
              max={9999}
              value={row.dailyLimit}
              onChange={(e) =>
                setExtras((current) =>
                  current.map((item, i) => (i === index ? { ...item, dailyLimit: Number(e.target.value) || 1 } : item))
                )
              }
            />
            <label>키워드 (줄 또는 쉼표)</label>
            <textarea
              rows={5}
              value={extraTexts[index] || ""}
              onChange={(e) =>
                setExtraTexts((current) => {
                  const next = current.slice();
                  next[index] = e.target.value;
                  return next;
                })
              }
              placeholder={"부천 애견미용\n인천 펫샵 추천"}
            />
          </section>
        ))}

        <label>캠페인 이름</label>
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="예: 아가펫 4월 광고"
        />

        <div className="hub-board-vendor">
          <div>
            <label>업체명</label>
            <input value={form.vendorName || ""} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} />
          </div>
          <VendorPicker
            onPick={(fields) =>
              setForm((prev) => ({
                ...prev,
                vendorId: fields.vendorId,
                vendorName: fields.vendorName,
                vendorPhone: fields.vendorPhone,
                vendorWebsite: fields.vendorWebsite,
                vendorKakao: fields.vendorKakao,
                title: prev.title || fields.vendorName,
              }))
            }
          />
        </div>
        <label>전화</label>
        <input value={form.vendorPhone || ""} onChange={(e) => setForm({ ...form, vendorPhone: e.target.value })} />
        <label>홈페이지</label>
        <input value={form.vendorWebsite || ""} onChange={(e) => setForm({ ...form, vendorWebsite: e.target.value })} />
        <label>카카오</label>
        <input value={form.vendorKakao || ""} onChange={(e) => setForm({ ...form, vendorKakao: e.target.value })} />
        <label>게시글 유튜브 1 (우선)</label>
        <input
          value={form.youtubeUrl1 || ""}
          onChange={(e) => setForm({ ...form, youtubeUrl1: e.target.value })}
          placeholder="https://www.youtube.com/watch?v=..."
        />
        <label>게시글 유튜브 2 (우선)</label>
        <input
          value={form.youtubeUrl2 || ""}
          onChange={(e) => setForm({ ...form, youtubeUrl2: e.target.value })}
          placeholder="두 번째 영상이 있으면 넣습니다"
        />
        <p className="field-hint">
          받는 사이트 글에 이 영상이 업체 영상보다 먼저 나갑니다. 키워드마다 따로 넣으면 그 예약만 덮어쓰고, 둘 다 비우면
          연결된 업체 영상을 씁니다.
        </p>

        <label className="admin-check-all">
          <input
            type="checkbox"
            checked={Boolean(form.vendorRecruitSlot)}
            onChange={(e) => setForm({ ...form, vendorRecruitSlot: e.target.checked })}
          />
          제휴업체모집중
        </label>
        <p className="field-hint">
          켜면 받는 사이트 광고 글에도 제휴업체모집중 칸이 붙습니다. 이미 나간 글은 그대로이고, 새로 발행되는 글부터
          적용됩니다. 등록안내는 그 사이트 운영자가 사이트설정에 넣은 주소가 있으면 그쪽으로, 없으면 총관리자
          사이트설정의 등록안내 페이지로 이동합니다. 사이트 운영자가 카테고리에서 제휴업체모집중을 켜 두면 그 설정도
          그대로 적용됩니다.
        </p>

        <label>광고 이미지</label>
        <div className="cover-upload">
          <MultiFileButton
            label={uploading ? "올리는 중…" : "이미지 올리기"}
            busy={uploading || folderBusy}
            onFiles={async (files) => {
              const images = pickImageFiles(files);
              if (!images.length) {
                setError("선택한 파일에서 사진을 찾지 못했습니다.");
                return;
              }
              setUploading(true);
              setError("");
              try {
                const urls: string[] = [];
                for (const file of images) {
                  const prepared = await prepareUploadImage(file);
                  const dataForm = new FormData();
                  dataForm.append("file", prepared);
                  const res = await fetch("/api/upload", { method: "POST", body: dataForm });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || "업로드 실패");
                  if (data.url) urls.push(String(data.url));
                }
                setForm((prev) => ({ ...prev, imagePool: mergeImageUrls(prev.imagePool || [], urls) }));
                setMessage(`${urls.length}장을 올렸습니다. 발행 때 대표·본문 사진으로 들어갑니다.`);
              } catch (err) {
                setError(err instanceof Error ? err.message : "업로드 실패");
              } finally {
                setUploading(false);
              }
            }}
          />
          {(form.imagePool || []).length ? (
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, imagePool: [] }))}
              disabled={uploading || folderBusy}
            >
              사진 비우기
            </button>
          ) : null}
        </div>
        <div className="bulk-folder-row">
          <label>
            웹 폴더 주소
            <input
              value={form.imageFolderUrl || ""}
              onChange={(e) => setForm({ ...form, imageFolderUrl: e.target.value })}
              placeholder="https://image.example.com/pome"
              disabled={uploading || folderBusy}
            />
          </label>
          <button className="btn" type="button" onClick={() => void importFolder()} disabled={uploading || folderBusy}>
            {folderBusy ? "가져오는 중…" : "폴더에서 가져오기"}
          </button>
        </div>
        <p className="field-hint">
          올린 사진이 자유게시판 광고 글의 대표 이미지와 본문 사진으로 쓰입니다. 폴더는 확장자·번호를 적을 필요 없이
          주소만 넣으면, 목록이 열려 있거나 01.webp처럼 번호 파일이면 알아서 가져옵니다. 제미나이·양식 공통으로
          아래 최소~최대 장수 안에서 랜덤으로 들어갑니다.
        </p>
        <div className="bulk-group-grid">
          <label>
            사진 최소
            <input
              type="number"
              min={1}
              max={7}
              value={form.imageCountMin || 1}
              onChange={(e) => {
                const min = Math.max(1, Math.min(7, Number(e.target.value) || 1));
                const max = Math.max(min, form.imageCountMax || 3);
                setForm({ ...form, imageCountMin: min, imageCountMax: Math.min(7, max) });
              }}
              disabled={uploading || folderBusy}
            />
          </label>
          <label>
            사진 최대
            <input
              type="number"
              min={1}
              max={7}
              value={form.imageCountMax || 3}
              onChange={(e) => {
                const max = Math.max(1, Math.min(7, Number(e.target.value) || 3));
                const min = Math.min(max, form.imageCountMin || 1);
                setForm({ ...form, imageCountMin: min, imageCountMax: max });
              }}
              disabled={uploading || folderBusy}
            />
          </label>
        </div>
        {(form.imagePool || []).length ? (
          <ul className="bulk-thumbs">
            {(form.imagePool || []).map((url) => (
              <li key={url}>
                <img src={url} alt="" />
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      imagePool: (prev.imagePool || []).filter((item) => item !== url),
                    }))
                  }
                >
                  빼기
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <label>추가 프롬프트 (실제 방문 후기)</label>
        <textarea
          value={form.extraPrompt || ""}
          onChange={(e) => setForm({ ...form, extraPrompt: e.target.value })}
          rows={5}
          placeholder="이 캠페인 글에 공통으로 넣습니다. 예: 직접 가서 본 메뉴, 대기, 맛, 주차, 다시 갈지 여부. 강조하고 싶은 안내도 여기에 적습니다."
        />
        <p className="field-hint">
          제미나이가 글을 쓸 때 이 내용을 함께 봅니다. 직접 가서 본 것을 적으면 그 메모로 후기글을 완성하고, 비워 두면
          없는 방문담은 만들지 않습니다.
        </p>

        <div className="bulk-group-grid">
          <label>
            하루 전체 발행 수량
            <input
              type="number"
              min={1}
              max={9999}
              value={form.dailyLimit}
              onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) || 1 })}
            />
          </label>
          <label>
            작성 방식
            <select
              value={form.contentMode || "gemini"}
              onChange={(e) => {
                const contentMode = e.target.value === "template" ? "template" : "gemini";
                setForm({
                  ...form,
                  contentMode,
                  templateId: contentMode === "template" ? form.templateId || DEFAULT_TEMPLATE_ID : form.templateId,
                });
              }}
            >
              <option value="gemini">제미나이</option>
              <option value="template">양식 (제미나이 없음)</option>
            </select>
          </label>
          {form.contentMode === "template" ? (
            <label>
              양식
              <select
                value={form.templateId || DEFAULT_TEMPLATE_ID}
                onChange={(e) => setForm({ ...form, templateId: e.target.value })}
              >
                {HUB_TEMPLATES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              글방향
              <select value={form.writingStyle || "random"} onChange={(e) => setForm({ ...form, writingStyle: e.target.value })}>
                {ARTICLE_STYLE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            매일 자동발행
            <select
              value={form.schedule.enabled ? "on" : "off"}
              onChange={(e) => {
                const enabled = e.target.value === "on";
                setForm({ ...form, schedule: { ...form.schedule, enabled } });
                if (!form.id) {
                  setMessage(
                    enabled
                      ? "자동발행을 켰습니다. 아래 「저장」을 눌러야 cron에 반영됩니다."
                      : "자동발행을 껐습니다. 「저장」을 눌러 반영하세요."
                  );
                } else {
                  setMessage(
                    enabled
                      ? "자동발행을 켰습니다. 「저장」을 눌러야 오늘 예약·cron에 반영됩니다."
                      : "자동발행을 껐습니다. 「저장」을 눌러 반영하세요."
                  );
                }
              }}
            >
              <option value="on">켜기</option>
              <option value="off">끄기</option>
            </select>
          </label>
          <label>
            시작 시각
            <select
              value={form.schedule.startHour}
              onChange={(e) => setForm({ ...form, schedule: { ...form.schedule, startHour: Number(e.target.value) } })}
            >
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {hour}시
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="field-hint">
          사이트 전체에 대한 하루 총량입니다. {perSiteHint}. 9999면 사실상 무제한.
          {form.contentMode === "template"
            ? " 양식 모드는 제미나이 없이 지역·키워드·업체를 뼈대에 넣어 씁니다. 키워드는 「부천 골든두들분양」처럼 지역+주제를 직접 넣으세요."
            : ""}
        </p>

        <label>대량 키워드 (줄 또는 쉼표)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={
            form.contentMode === "template"
              ? "부천 골든두들분양\n인천 골든두들분양\n수원 골든두들분양"
              : "부천 애견미용\n인천 펫샵 추천\n강아지 호텔"
          }
        />

        <div className="hub-board-sites">
          <div className="hub-board-sites-head">
            <div>
              <b>순차 발행 사이트 (위부터 한 키워드씩)</b>
              <p className="field-hint" style={{ margin: "4px 0 0" }}>
                {sites.length}곳 중 {form.siteIds.length}곳 선택
              </p>
            </div>
            <div className="admin-actions" style={{ margin: 0 }}>
              <button className="btn btn-ghost" type="button" onClick={() => setSitesOpen((open) => !open)}>
                {sitesOpen ? "접기" : "펼치기"}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    siteIds: prev.siteIds.length === sites.length ? [] : sites.map((site) => site.id),
                  }))
                }
              >
                {form.siteIds.length === sites.length ? "선택 해제" : "모두 선택"}
              </button>
            </div>
          </div>
          {sites.length === 0 ? (
            <p className="field-hint">동의한 사이트가 없습니다. 사이트 대장에서 광고글 동의를 켜 주세요.</p>
          ) : (
            <div className={`hub-board-sites-body${sitesOpen ? " is-open" : ""}`}>
              {grouped.map(([apex, rows]) => (
                <div className="hub-board-group" key={apex}>
                  <p>{apex}</p>
                  {rows.map((site) => (
                    <label key={site.id}>
                      <input type="checkbox" checked={form.siteIds.includes(site.id)} onChange={() => toggleSite(site.id)} />
                      {site.domain}
                      {site.siteName ? ` · ${site.siteName}` : ""}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {form.stats ? (
          <p className="field-hint">
            키워드 {form.stats.total} · 발행 {form.stats.published} · 남은 {form.stats.remaining}
            {form.stats.daysLeft ? ` · 약 ${form.stats.daysLeft}일` : ""} · 하루 {form.dailyLimit}편
          </p>
        ) : null}
        {form.today ? (
          <p className="field-hint">
            오늘 발행 {form.today.publishedToday} / 한도 {form.today.dailyLimit} · 오늘 예약 {form.today.scheduledToday} ·
            남은 오늘 {form.today.remainingToday} · 대기 {form.today.waiting}
          </p>
        ) : null}
        {error ? <p className="notice">{error}</p> : null}
        {message ? <p className="field-hint">{message}</p> : null}
        <div className="admin-actions">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "저장 중…" : saveLabel}
          </button>
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={runTick}>
            대기 발행 실행
          </button>
          {form.id ? (
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => deleteCampaign(form.id)}>
              이 광고 삭제
            </button>
          ) : null}
          <button className="btn btn-ghost" type="button" onClick={startNew}>
            새 광고
          </button>
          <button className="btn btn-ghost" type="button" onClick={addExtra}>
            다른 업체로 하나 더
          </button>
        </div>
      </form>

      <div className="admin-card">
        <h2>예약·대기 현황</h2>
        <p className="field-hint">
          아직 안 나간 글만 보입니다. 예약 시각이 지난 글은 Production cron이 제미나이로 작성해서 올립니다. 이 화면의
          실행/발행 버튼은 밀린 분량을 수동으로 밀어 넣는 용도입니다. 전용 발행은 하루 10번이고, 광고마다 한 번에 최대
          16편입니다. 업체를 추가로 등록한 광고는 그 16편을 나눠 쓰지 않고 따로 나갑니다. 글대량등록은 한 번에 6편입니다.
        </p>
        {activeKeywords.length === 0 ? (
          <p className="field-hint">키워드를 넣고 저장하면, 위에서부터 사이트 하나씩 배정·예약됩니다.</p>
        ) : (
          <>
            <ul className="hub-board-log">
              {activeSlice.map((row) => (
                <li key={row.id}>
                  <strong>{row.keyword}</strong>
                  <span>
                    {statusLabel(row.status)}
                    {row.scheduledAt && (row.status === "scheduled" || row.status === "queued" || row.status === "processing")
                      ? ` · 예약발행시간 ${formatScheduleTime(row.scheduledAt)}`
                      : ""}
                    {row.domain ? ` · ${row.domain}` : " · 아직 배정 전"}
                    {row.title ? ` · ${row.title}` : ""}
                    {row.error ? ` · ${row.error}` : ""}
                  </span>
                  {row.status !== "published" && row.status !== "processing" ? (
                    <>
                      <label className="hub-board-yt">
                        게시글 유튜브 (우선)
                        <input
                          value={row.youtubeUrl1 || ""}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              keywords: prev.keywords.map((item) =>
                                item.id === row.id ? { ...item, youtubeUrl1: e.target.value } : item
                              ),
                            }))
                          }
                          placeholder="이 키워드만 덮어쓰기 · 비우면 캠페인 주소"
                        />
                      </label>
                      <button className="btn btn-ghost" type="button" disabled={Boolean(nowId) || busy} onClick={() => publishNow(row.id)}>
                        {nowId === row.id ? "작성 중…" : "지금 이 사이트에 발행"}
                      </button>
                      <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => deleteKeyword(row.id)}>
                        삭제
                      </button>
                    </>
                  ) : row.youtubeUrl1 ? (
                    <em>게시글 유튜브 지정</em>
                  ) : (
                    <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => deleteKeyword(row.id)}>
                      삭제
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <PageNav page={activePage} total={activeKeywords.length} onChange={setActivePage} />
          </>
        )}
      </div>

      <div className="admin-card">
        <details className="hub-board-done">
          <summary>
            완료된 글 (오늘 {doneToday.length}건)
            <span className="field-hint"> · 하루 지나면 자동으로 숨김</span>
          </summary>
          {doneToday.length === 0 ? (
            <p className="field-hint">오늘 발행 완료된 글이 없습니다.</p>
          ) : (
            <>
              <ul className="hub-board-log">
                {doneSlice.map((row) => (
                  <li key={row.id}>
                    <strong>{row.keyword}</strong>
                    <span>
                      발행
                      {row.publishedAt ? ` · ${formatScheduleTime(row.publishedAt)}` : ""}
                      {row.domain ? ` · ${row.domain}` : ""}
                      {row.title ? ` · ${row.title}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <PageNav page={donePage} total={doneToday.length} onChange={setDonePage} />
            </>
          )}
        </details>
      </div>
    </div>
  );
}
