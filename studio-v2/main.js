const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { readDrafts, writeDrafts, uid, previewHost } = require("./lib/drafts");
const { readSites, upsertSite, clearSites, removeSite } = require("./lib/ledger");
const {
  provisionSite,
  applyBrandBootstrap,
  verifyToken,
  DEFAULT_REPO,
  sharedProjectNameFromDomain,
} = require("./lib/provision");
const { DEFAULT_TEAM_ID, DEFAULT_OPS_HUB_URL, DEFAULT_SINGLE_PROJECT_PER_APEX } = require("./lib/defaults");
const { resolveVendorAddress } = require("./lib/auto-address");
const { generateSiteTagline, applySiteTagline } = require("./lib/site-tagline");
const {
  parseVendorGroupsText,
  normalizeVendorGroupsFromStudio,
  resolveVendorGroupsFromPayload,
  applyVendorGroupToPayload,
  syncVendorGroups,
} = require("./lib/vendor-groups");

function configPath() {
  return path.join(app.getPath("userData"), "brand-studio-config.json");
}

const SITE_THEME_IDS = ["folio", "press", "night", "journal", "qna", "talk", "portal", "carrot", "studio"];

function hashPick(text, mod) {
  let h = 2166136261;
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % Math.max(1, mod);
}

function resolveSiteTheme(choice, keyword, index) {
  const raw = String(choice || "random").trim();
  if (raw && raw !== "random" && SITE_THEME_IDS.includes(raw)) return raw;
  return SITE_THEME_IDS[hashPick(`${keyword}|${index}`, SITE_THEME_IDS.length)] || "folio";
}

function parseNaverMetaMap(raw) {
  const map = {};
  for (const line of String(raw || "").split(/\r?\n/)) {
    const text = line.trim();
    if (!text) continue;
    const idx = text.search(/[|\t]/);
    if (idx < 0) continue;
    const key = text.slice(0, idx).trim();
    const value = text.slice(idx + 1).trim();
    if (key && value) map[key] = value;
  }
  return map;
}

function defaultConfig() {
  return {
    token: "",
    teamId: DEFAULT_TEAM_ID,
    repo: DEFAULT_REPO,
    opsHubUrl: DEFAULT_OPS_HUB_URL,
    opsMasterPassword: "",
    deploymentProtectionBypass: "",
    geminiApiKey: "",
    geminiModel: "",
  };
}

function maskSecret(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length <= 10) return "****";
  return `${raw.slice(0, 6)}****${raw.slice(-4)}`;
}

/** 마스킹·빈 값이면 이전 비밀값을 유지 */
function isKeepPreviousSecret(value) {
  const raw = String(value || "").trim();
  if (!raw) return true;
  if (raw.includes("*") || raw.includes("•") || raw.includes("…")) return true;
  return false;
}

/** 모델 칸에 API 키를 잘못 넣은 경우 감지 */
function looksLikeGeminiApiKey(value) {
  const raw = String(value || "").trim();
  if (raw.length < 20) return false;
  if (/^AIza[0-9A-Za-z_\-]{20,}$/.test(raw)) return true;
  if (/^AQ\.[A-Za-z0-9_\-]{20,}$/.test(raw)) return true;
  if (/gemini/i.test(raw)) return false;
  if (/^[A-Za-z0-9._\-]{36,}$/.test(raw)) return true;
  return false;
}

function resolveGeminiFields(payload, prev) {
  let nextKey = String(payload?.geminiApiKey ?? "").trim();
  let nextModel = String(payload?.geminiModel ?? "").trim();
  let rescued = false;
  if (isKeepPreviousSecret(nextKey) && looksLikeGeminiApiKey(nextModel)) {
    nextKey = nextModel;
    nextModel = "";
    rescued = true;
  }
  let geminiApiKey = !isKeepPreviousSecret(nextKey) ? nextKey : String(prev.geminiApiKey || "").trim();
  let geminiModel = nextModel;
  if (!nextModel && payload?.geminiModel === undefined) {
    geminiModel = String(prev.geminiModel || "").trim();
  }
  if (!geminiApiKey && looksLikeGeminiApiKey(geminiModel)) {
    geminiApiKey = geminiModel;
    geminiModel = "";
    rescued = true;
  }
  if (!geminiApiKey && looksLikeGeminiApiKey(prev.geminiModel)) {
    geminiApiKey = String(prev.geminiModel || "").trim();
    geminiModel = "";
    rescued = true;
  }
  return { geminiApiKey, geminiModel, rescued };
}

function ensureConfigHydrated() {
  return readConfig();
}

function readConfig() {
  try {
    const raw = { ...defaultConfig(), ...JSON.parse(fs.readFileSync(configPath(), "utf8")) };
    const fixed = resolveGeminiFields(
      { geminiApiKey: raw.geminiApiKey, geminiModel: raw.geminiModel },
      raw
    );
    const next = {
      ...raw,
      geminiApiKey: fixed.geminiApiKey,
      geminiModel: fixed.geminiModel,
    };
    if (fixed.rescued || next.geminiApiKey !== raw.geminiApiKey || next.geminiModel !== raw.geminiModel) {
      writeConfig(next);
    }
    return next;
  } catch {
    return defaultConfig();
  }
}

function writeConfig(cfg) {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf8");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1220,
    height: 880,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function sendLog(event, message) {
  try {
    event.sender.send("brand:log", String(message || ""));
  } catch {
    /* ignore */
  }
}

ipcMain.handle("brand:load", async () => {
  const cfg = ensureConfigHydrated();
  return {
    config: {
      ...cfg,
      token: maskSecret(cfg.token),
      geminiApiKey: maskSecret(cfg.geminiApiKey),
      deploymentProtectionBypass: maskSecret(cfg.deploymentProtectionBypass),
      hasToken: Boolean(cfg.token),
      hasGeminiKey: Boolean(cfg.geminiApiKey),
      hasDeploymentBypass: Boolean(cfg.deploymentProtectionBypass),
    },
    drafts: readDrafts(app.getPath("userData")),
    sites: readSites(app.getPath("userData")),
  };
});

ipcMain.handle("brand:save-settings", async (_e, payload) => {
  const prev = readConfig();
  const nextToken = String(payload?.token || "").trim();
  const gemini = resolveGeminiFields(payload || {}, prev);
  const cfg = {
    ...prev,
    token: !isKeepPreviousSecret(nextToken) ? nextToken : prev.token,
    teamId: String(payload?.teamId || "").trim(),
    repo: String(payload?.repo || "").trim() || DEFAULT_REPO,
    opsHubUrl: String(payload?.opsHubUrl || "").trim() || DEFAULT_OPS_HUB_URL,
    opsMasterPassword: !isKeepPreviousSecret(String(payload?.opsMasterPassword ?? ""))
      ? String(payload?.opsMasterPassword || "").trim()
      : String(prev.opsMasterPassword || "").trim(),
    deploymentProtectionBypass: !isKeepPreviousSecret(String(payload?.deploymentProtectionBypass ?? ""))
      ? String(payload?.deploymentProtectionBypass || "").trim()
      : String(prev.deploymentProtectionBypass || "").trim(),
    geminiApiKey: gemini.geminiApiKey,
    geminiModel: gemini.geminiModel,
  };
  writeConfig(cfg);
  return {
    ok: true,
    rescuedGeminiKey: Boolean(gemini.rescued),
    config: {
      ...cfg,
      token: maskSecret(cfg.token),
      geminiApiKey: maskSecret(cfg.geminiApiKey),
      deploymentProtectionBypass: maskSecret(cfg.deploymentProtectionBypass),
      hasToken: Boolean(cfg.token),
      hasGeminiKey: Boolean(cfg.geminiApiKey),
      hasDeploymentBypass: Boolean(cfg.deploymentProtectionBypass),
    },
  };
});

ipcMain.handle("brand:verify-token", async () => {
  const cfg = ensureConfigHydrated();
  if (!cfg.token) throw new Error("Vercel 토큰을 저장하세요. (기존 스튜디오 설정 가져오기 가능)");
  return verifyToken(cfg.token, cfg.teamId);
});

ipcMain.handle("brand:save-draft", async (_e, payload) => {
  const drafts = readDrafts(app.getPath("userData"));
  const now = new Date().toISOString();
  const id = String(payload?.id || "").trim() || uid();
  const keywords = Array.isArray(payload?.keywords)
    ? payload.keywords.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const next = {
    id,
    title: String(payload?.title || keywords[0] || "브랜드 초안").trim(),
    apexDomain: String(payload?.apexDomain || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, ""),
    keywords,
    siteTheme: String(payload?.siteTheme || "random"),
    naverId: String(payload?.naverId || "").trim(),
    naverPassword: String(payload?.naverPassword || "").trim(),
    naverSiteVerification: String(payload?.naverSiteVerification || "").trim(),
    naverMetaMap: String(payload?.naverMetaMap || ""),
    vendorGroupsText: String(payload?.vendorGroupsText || ""),
    vendorGroups: normalizeVendorGroupsFromStudio(payload?.vendorGroups),
    useGeminiEnrich: Boolean(payload?.useGeminiEnrich),
    mainLanding: payload?.mainLanding || {},
    seoTitleSuffix: String(payload?.seoTitleSuffix || payload?.mainLanding?.seoTitleSuffix || "").trim(),
    notes: String(payload?.notes || ""),
    createdAt: drafts.find((d) => d.id === id)?.createdAt || now,
    updatedAt: now,
  };
  const idx = drafts.findIndex((d) => d.id === id);
  if (idx >= 0) drafts[idx] = next;
  else drafts.unshift(next);
  writeDrafts(app.getPath("userData"), drafts);
  return { ok: true, drafts, draft: next };
});

ipcMain.handle("brand:delete-draft", async (_e, id) => {
  const drafts = readDrafts(app.getPath("userData")).filter((d) => d.id !== id);
  writeDrafts(app.getPath("userData"), drafts);
  return { ok: true, drafts };
});

ipcMain.handle("brand:preview", async (_e, payload) => {
  const apex = String(payload?.apexDomain || "").trim();
  const keywords = Array.isArray(payload?.keywords) ? payload.keywords : [];
  return keywords.map((keyword) => {
    const row = previewHost(keyword, apex);
    return { keyword, ...row };
  });
});

ipcMain.handle("brand:publish-batch", async (event, payload) => {
  const cfg = ensureConfigHydrated();
  let studioVersion = "0.0.0";
  try {
    studioVersion = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")).version || studioVersion;
  } catch {
    /* ignore */
  }
  sendLog(event, `Infocs Brand Studio v${studioVersion}`);
  if (!cfg.token) throw new Error("계정 설정에서 Vercel 토큰을 저장하거나, 기존 스튜디오 설정을 가져오세요.");
  if (!String(cfg.opsMasterPassword || "").trim()) {
    throw new Error("계정 설정에 마스터 비밀번호를 저장하세요. 메인 디자인을 켠 상태로 사이트에 심을 때 필요합니다.");
  }
  const apex = String(payload?.apexDomain || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  const keywords = Array.isArray(payload?.keywords)
    ? payload.keywords.map((k) => String(k || "").trim()).filter(Boolean)
    : [];
  if (!apex || !keywords.length) throw new Error("apex와 키워드를 입력하세요.");

  const vendor = payload?.vendor || {};
  const themeChoice = String(payload?.siteTheme || "random").trim() || "random";
  const designId = String(payload?.designId || "scalp-tattoo-v1");
  const imageFolderUrl = String(payload?.imageFolderUrl || "").trim();
  const prompt = String(payload?.prompt || "").trim();
  const seoTitleSuffix = String(payload?.seoTitleSuffix || payload?.mainLanding?.seoTitleSuffix || "").trim();
  const businessName = String(vendor.name || "").trim() || "필릭스스칼프";
  const typedAddress = String(vendor.address || "").trim();
  const naverId = String(payload?.naverId || "").trim();
  const naverPassword = String(payload?.naverPassword || "").trim();
  const naverDefault = String(payload?.naverSiteVerification || "").trim();
  const naverMap = parseNaverMetaMap(payload?.naverMetaMap);

  const vendorGroups = resolveVendorGroupsFromPayload(payload);
  const useGeminiEnrich = Boolean(payload?.useGeminiEnrich);
  const results = [];
  let groupsSynced = false;
  for (let i = 0; i < keywords.length; i += 1) {
    const keyword = keywords[i];
    const { host, punycode } = previewHost(keyword, apex);
    const domain = punycode || host;
    const siteTheme = resolveSiteTheme(themeChoice, keyword, i);
    const naverSiteVerification = naverMap[keyword] || naverDefault;
    const address = resolveVendorAddress({
      address: typedAddress,
      keyword,
      name: businessName,
    });
    sendLog(event, `\n===== [${i + 1}/${keywords.length}] ${keyword} → ${domain} =====`);
    sendLog(event, `메인 디자인: ON (${designId})`);
    if (seoTitleSuffix) sendLog(event, `SEO 제목: ${keyword} | ${seoTitleSuffix}`);
    sendLog(event, `블로그 디자인: ${siteTheme}${themeChoice === "random" ? " (랜덤)" : ""}`);
    sendLog(event, `주소: ${address}${typedAddress ? "" : " (자동)"}`);
    if (naverSiteVerification) sendLog(event, "네이버 인증 메타: 적용 예정");
    if (!domain || !domain.includes(".")) {
      results.push({ keyword, ok: false, error: "도메인 미리보기 실패" });
      continue;
    }
    const variationSeed = `${keyword}|${businessName}|${apex}|${siteTheme}|${i}`;
    try {
      sendLog(
        event,
        useGeminiEnrich
          ? "제미나이로 검색용 소개 문구(메타 설명) 생성 중…"
          : "문구 풀 + 키워드 조합으로 검색용 소개 문구 생성 중…"
      );
      const siteTagline = await generateSiteTagline({
        keyword,
        vendorName: businessName,
        apiKey: useGeminiEnrich ? cfg.geminiApiKey : "",
        model: cfg.geminiModel,
        seed: `${variationSeed}|seo-tagline`,
        useGemini: useGeminiEnrich,
        designId,
      });
      sendLog(event, `소개 문구: ${siteTagline}`);

      const sharedProjectName = sharedProjectNameFromDomain(domain);
      const studioHttpOpts = { bypassSecret: cfg.deploymentProtectionBypass };
      const provisioned = await provisionSite(
        {
          token: cfg.token,
          teamId: cfg.teamId,
          repo: cfg.repo,
          domain,
          blogName: keyword,
          masterPassword: cfg.opsMasterPassword,
          deploymentProtectionBypass: cfg.deploymentProtectionBypass,
          naverSiteVerification,
          geminiApiKey: cfg.geminiApiKey,
          geminiModel: cfg.geminiModel,
          siteTagline,
          singleProjectPerApex: DEFAULT_SINGLE_PROJECT_PER_APEX,
          sharedProjectName,
          confirmExistingProject: async () => true,
          deployProduction: i === 0,
        },
        (msg) => sendLog(event, msg)
      );

      // 배포 직후 첫 요청이 빈 스토어를 심기 전에 부트스트랩이 이기도록 짧게 대기
      sendLog(event, "사이트 응답 대기 후 메인 디자인을 적용합니다…");
      await new Promise((r) => setTimeout(r, 8000));

      const mainLanding = {
        enabled: true,
        designId,
        vendor: {
          name: businessName,
          keyword,
          phone: String(vendor.phone || "").trim(),
          address,
          businessNumber: String(vendor.businessNumber || "").trim(),
          kakao: String(vendor.kakao || "").trim(),
          industry: designId === "demolition-v1" ? "철거" : "두피문신",
          region: "",
          intro: siteTagline,
          website: "",
          strengths: "",
        },
        imageFolderUrl,
        slots: {},
        prompt,
        seoTitleSuffix,
        variationSeed,
      };

      if (useGeminiEnrich) {
        if (!cfg.geminiApiKey) {
          sendLog(event, "경고: 제미나이 체크됐으나 API Key 없음 — 메인 enrich는 서버에서 건너뜁니다.");
        } else {
          sendLog(event, "제미나이로 메인 문장 보충(enrich)을 요청합니다…");
        }
      } else {
        sendLog(event, "메인 내용: 템플릿·후기·소개 문구 풀을 키워드·시드로 조합합니다 (제미나이 미사용).");
      }
      if (vendorGroups.length && !groupsSynced) {
        await syncVendorGroups(
          [provisioned.vercelHost, provisioned.siteUrl],
          vendorGroups,
          cfg.opsMasterPassword,
          (msg) => sendLog(event, msg),
          studioHttpOpts
        );
        groupsSynced = true;
      }

      const grouped = applyVendorGroupToPayload(keyword, mainLanding.vendor, vendorGroups);
      if (grouped.groupId) {
        mainLanding.vendor = grouped.vendor;
        sendLog(event, `업체 그룹 적용: ${grouped.groupId} (${keyword})`);
      }
      mainLanding.vendor.address = resolveVendorAddress({
        address: mainLanding.vendor.address,
        keyword,
        name: mainLanding.vendor.name || businessName,
      });

      const industry =
        designId === "demolition-v1" ? "철거" : designId === "scalp-tattoo-v1" ? "두피문신" : "브랜드";
      mainLanding.vendor.industry = industry;

      sendLog(event, "메인랜딩 ON · 블로그 테마 적용 중…");
      const profileHost = provisioned.domain || provisioned.publicHost;
      const hostCandidates = [profileHost, host].filter(
        (h, i, arr) => h && arr.indexOf(h) === i
      );
      const bootstrapped = await applyBrandBootstrap(
        [provisioned.vercelHost, provisioned.siteUrl],
        {
          host: profileHost,
          domain: profileHost,
          hostAliases: hostCandidates,
          siteName: keyword,
          siteTagline,
          company: mainLanding.vendor.name || businessName,
          phone: mainLanding.vendor.phone,
          address: mainLanding.vendor.address || address,
          bizNo: mainLanding.vendor.businessNumber,
          siteTheme,
          mainLanding: { ...mainLanding, enabled: true },
          enrich: useGeminiEnrich,
          ...(vendorGroups.length ? { vendorGroups } : {}),
          ...(useGeminiEnrich && cfg.geminiApiKey ? { geminiApiKey: cfg.geminiApiKey } : {}),
          ...(useGeminiEnrich && cfg.geminiModel ? { geminiModel: cfg.geminiModel } : {}),
          ...(naverSiteVerification ? { naverSiteVerification } : {}),
        },
        cfg.opsMasterPassword,
        (msg) => sendLog(event, msg),
        { ...studioHttpOpts, hostCandidates }
      );
      if (!bootstrapped) {
        throw new Error(
          "메인 디자인(ON) 적용에 실패했습니다. Vercel 배포 보호 우회 시크릿·MASTER_PASSWORD(마스터 비번)를 확인하세요."
        );
      }
      sendLog(event, "메인 디자인이 켜진 상태로 적용되었습니다.");

      // 기존 클론 코드에도 검색 소개가 확실히 들어가도록 설정 API로 한 번 더 반영
      await applySiteTagline(
        [provisioned.vercelHost, provisioned.siteUrl],
        {
          siteName: keyword,
          siteTagline,
          ...(cfg.geminiApiKey ? { geminiApiKey: cfg.geminiApiKey } : {}),
          ...(cfg.geminiModel ? { geminiModel: cfg.geminiModel } : {}),
        },
        cfg.opsMasterPassword,
        (msg) => sendLog(event, msg),
        studioHttpOpts
      );

      const sites = upsertSite(app.getPath("userData"), {
        keyword,
        siteName: keyword,
        siteTagline,
        domain: provisioned.domain,
        apexDomain: apex,
        siteTheme,
        designId,
        mainLandingEnabled: true,
        variationSeed,
        address,
        naverId,
        naverPassword,
        naverSiteVerification: naverSiteVerification || "",
        projectName: provisioned.projectName,
        vercelHost: provisioned.vercelHost,
        siteUrl: provisioned.siteUrl,
        adminUrl: provisioned.adminUrl,
        verified: provisioned.verified,
        createdAt: provisioned.createdAt,
        dns: provisioned.dns,
      });
      results.push({
        keyword,
        ok: true,
        siteTheme,
        mainLandingEnabled: true,
        address,
        variationSeed,
        siteTagline,
        ...provisioned,
        dns: provisioned.dns,
      });
      sendLog(event, `저장됨 (로컬 대장 ${sites.length}개)`);
    } catch (err) {
      sendLog(event, `실패: ${err.message}`);
      results.push({ keyword, ok: false, error: err.message });
    }
  }

  return {
    ok: true,
    results,
    sites: readSites(app.getPath("userData")),
  };
});

ipcMain.handle("brand:clear-sites", async () => {
  const sites = clearSites(app.getPath("userData"));
  return { ok: true, sites };
});

async function deleteRemoteHostProfile(site, cfg) {
  const { sortStudioApiBases, studioAuthHeaders } = require("./lib/http-client");
  const host = String(site.domain || site.id || "").trim();
  if (!host || !cfg.opsMasterPassword) return { ok: false, reason: "host or password missing" };
  const bases = sortStudioApiBases([site.vercelHost, site.siteUrl].filter(Boolean));
  const auth = studioAuthHeaders({
    masterPassword: cfg.opsMasterPassword,
    bypassSecret: cfg.deploymentProtectionBypass,
  });
  for (const base of bases) {
    try {
      const res = await fetch(
        `${String(base).replace(/\/$/, "")}/api/brand-studio/host-profile?host=${encodeURIComponent(host)}`,
        { method: "DELETE", headers: auth, signal: AbortSignal.timeout(60000) }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, removed: data.removed || [host], via: base };
    } catch {
      /* next */
    }
  }
  return { ok: false, reason: "remote delete failed" };
}

ipcMain.handle("brand:delete-site", async (_e, payload) => {
  const cfg = ensureConfigHydrated();
  const domain = String(payload?.domain || payload?.id || "")
    .trim()
    .toLowerCase();
  if (!domain) throw new Error("삭제할 도메인을 지정하세요.");
  const userData = app.getPath("userData");
  const sites = readSites(userData);
  const current = sites.find((row) => String(row.domain || row.id || "").toLowerCase() === domain);
  if (!current) throw new Error("발행 대장에 해당 도메인이 없습니다.");

  let remote = { ok: false, skipped: true };
  if (payload?.removeRemoteProfile !== false && cfg.opsMasterPassword) {
    remote = await deleteRemoteHostProfile(current, cfg);
  }
  const nextSites = removeSite(userData, domain);
  return {
    ok: true,
    sites: nextSites,
    remoteRemoved: remote.ok,
    remoteDetail: remote,
  };
});

ipcMain.handle("brand:parse-vendor-groups-text", async (_e, text) => parseVendorGroupsText(String(text || "")));

ipcMain.handle("brand:apply-vendor-groups", async (_e, payload) => {
  const cfg = ensureConfigHydrated();
  if (!String(cfg.opsMasterPassword || "").trim()) {
    throw new Error("마스터 비밀번호를 저장하세요.");
  }
  const groups = resolveVendorGroupsFromPayload(payload);
  if (!groups.length) throw new Error("업체 그룹을 1개 이상 입력하세요.");
  const sites = readSites(app.getPath("userData"));
  const hub = String(cfg.opsHubUrl || "").replace(/\/$/, "");
  const fromSite = sites.find((s) => s.siteUrl || s.vercelHost);
  const { sortStudioApiBases, studioAuthHeaders, mergeHeaders } = require("./lib/http-client");
  const bases = sortStudioApiBases([fromSite?.vercelHost, fromSite?.siteUrl, hub].filter(Boolean));
  if (!bases.length) {
    throw new Error("발행된 사이트 URL 또는 허브 URL이 필요합니다.");
  }
  const auth = studioAuthHeaders({
    masterPassword: cfg.opsMasterPassword,
    bypassSecret: cfg.deploymentProtectionBypass,
  });
  const res = await fetch(`${bases[0]}/api/brand-studio/vendor-groups`, {
    method: "POST",
    headers: mergeHeaders({ "Content-Type": "application/json" }, auth),
    body: JSON.stringify({ vendorGroups: groups, apply: true }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return { ok: true, count: data.count || groups.length, hostsUpdated: data.hostsUpdated || 0 };
});

function resolveLedgerApex(site) {
  let apex = String(site?.apexDomain || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  if (apex) return apex;
  const host = String(site?.domain || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  const parts = host.split(".").filter(Boolean);
  const kr2 = ["co.kr", "or.kr", "go.kr", "ne.kr", "re.kr", "ac.kr"];
  const last2 = parts.slice(-2).join(".");
  if (kr2.includes(last2) && parts.length >= 3) return parts.slice(-3).join(".");
  if (parts.length >= 2) return parts.slice(-2).join(".");
  return host;
}

ipcMain.handle("brand:apply-apex-contact", async (_e, payload) => {
  const cfg = ensureConfigHydrated();
  if (!String(cfg.opsMasterPassword || "").trim()) {
    throw new Error("마스터 비밀번호를 저장하세요.");
  }
  const domain = String(payload?.domain || payload?.id || "")
    .trim()
    .toLowerCase();
  const sites = readSites(app.getPath("userData"));
  const site = sites.find((row) => String(row.domain || row.id || "").toLowerCase() === domain);
  const hub = String(cfg.opsHubUrl || "").replace(/\/$/, "");
  const fromSite = site || sites.find((s) => s.siteUrl || s.vercelHost);
  const { sortStudioApiBases, studioAuthHeaders, mergeHeaders } = require("./lib/http-client");
  const bases = sortStudioApiBases([fromSite?.vercelHost, fromSite?.siteUrl, hub].filter(Boolean));
  if (!bases.length) {
    throw new Error("발행 대장 사이트 URL 또는 허브 URL이 필요합니다.");
  }
  const apex = String(payload?.apex || resolveLedgerApex(site || fromSite) || "").trim();
  if (!apex) throw new Error("메인 도메인(apex)을 확인할 수 없습니다.");

  const body = {
    apex,
    company: String(payload?.company || "").trim(),
    phone: String(payload?.phone || "").trim(),
    address: String(payload?.address || "").trim(),
    bizNo: String(payload?.bizNo || payload?.businessNumber || "").trim(),
  };
  if (!body.company && !body.phone && !body.address && !body.bizNo) {
    throw new Error("상호·전화·주소·사업자번호 중 하나 이상 입력하세요.");
  }

  const auth = studioAuthHeaders({
    masterPassword: cfg.opsMasterPassword,
    bypassSecret: cfg.deploymentProtectionBypass,
  });
  const res = await fetch(`${bases[0]}/api/brand-studio/host-profiles/bulk-contact`, {
    method: "POST",
    headers: mergeHeaders({ "Content-Type": "application/json" }, auth),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

  const ledgerCount = sites.filter((s) => resolveLedgerApex(s) === apex.replace(/^www\./, "")).length;
  return {
    ok: true,
    apex: data.apex || apex,
    hostsUpdated: data.hostsUpdated || 0,
    ledgerCount,
  };
});

ipcMain.handle("brand:clipboard-write", async (_e, text) => {
  const { clipboard } = require("electron");
  clipboard.writeText(String(text || ""));
  return { ok: true };
});

ipcMain.handle("brand:bulk-apply-naver-meta", async (_e, payload) => {
  const cfg = ensureConfigHydrated();
  if (!String(cfg.opsMasterPassword || "").trim()) {
    throw new Error("마스터 비밀번호를 저장하세요.");
  }
  const userData = app.getPath("userData");
  const sites = readSites(userData);
  const rawEntries = Array.isArray(payload?.entries) ? payload.entries : [];
  if (!rawEntries.length) throw new Error("반영할 메타가 없습니다.");

  const { sortStudioApiBases, studioAuthHeaders, mergeHeaders } = require("./lib/http-client");
  const hub = String(cfg.opsHubUrl || "").replace(/\/$/, "");
  const auth = studioAuthHeaders({
    masterPassword: cfg.opsMasterPassword,
    bypassSecret: cfg.deploymentProtectionBypass,
  });

  const byBase = new Map();
  for (const row of rawEntries) {
    const domain = String(row.domain || row.host || "")
      .trim()
      .toLowerCase();
    const meta = String(row.naverSiteVerification || row.meta || "").trim();
    if (!domain || !meta) continue;
    const site = sites.find((s) => String(s.domain || s.id || "").toLowerCase() === domain);
    const bases = sortStudioApiBases([site?.vercelHost, site?.siteUrl, hub].filter(Boolean));
    const base = bases[0];
    if (!base) {
      throw new Error(`${domain}: Vercel URL이 없습니다. 발행 대장에 siteUrl/vercelHost가 필요합니다.`);
    }
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push({
      host: site?.domain || domain,
      naverSiteVerification: meta,
      domain,
    });
  }
  if (!byBase.size) throw new Error("유효한 메타 입력이 없습니다.");

  let totalUpdated = 0;
  let totalSkipped = 0;
  const notFound = [];
  for (const [base, entries] of byBase.entries()) {
    const res = await fetch(`${String(base).replace(/\/$/, "")}/api/brand-studio/host-profiles/bulk-naver`, {
      method: "POST",
      headers: mergeHeaders({ "Content-Type": "application/json" }, auth),
      body: JSON.stringify({ entries: entries.map((e) => ({ host: e.host, naverSiteVerification: e.naverSiteVerification })) }),
      signal: AbortSignal.timeout(120000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status} @ ${base}`);
    totalUpdated += data.updated || 0;
    totalSkipped += data.skipped || 0;
    if (Array.isArray(data.notFound)) notFound.push(...data.notFound);
  }

  let nextSites = sites;
  for (const row of rawEntries) {
    const domain = String(row.domain || "").trim().toLowerCase();
    const meta = String(row.naverSiteVerification || "").trim();
    if (!domain || !meta) continue;
    const current = nextSites.find((s) => String(s.domain || s.id || "").toLowerCase() === domain);
    if (!current) continue;
    nextSites = upsertSite(userData, { ...current, naverSiteVerification: meta });
  }

  return {
    ok: true,
    updated: totalUpdated,
    skipped: totalSkipped,
    notFound,
    sites: nextSites,
  };
});

ipcMain.handle("brand:update-site", async (_e, payload) => {
  const cfg = ensureConfigHydrated();
  const domain = String(payload?.domain || payload?.id || "")
    .trim()
    .toLowerCase();
  if (!domain) throw new Error("수정할 사이트를 선택하세요.");
  const sites = readSites(app.getPath("userData"));
  const current = sites.find((row) => String(row.domain || row.id || "").toLowerCase() === domain);
  if (!current) throw new Error("대장에서 사이트를 찾지 못했습니다.");

  const naverSiteVerification = String(
    payload?.naverSiteVerification !== undefined ? payload.naverSiteVerification : current.naverSiteVerification || ""
  ).trim();
  const naverId = String(payload?.naverId !== undefined ? payload.naverId : current.naverId || "").trim();
  const naverPassword = String(
    payload?.naverPassword !== undefined ? payload.naverPassword : current.naverPassword || ""
  ).trim();
  const address = String(payload?.address !== undefined ? payload.address : current.address || "").trim();
  const siteTheme = String(payload?.siteTheme || current.siteTheme || "folio").trim();

  const nextSites = upsertSite(app.getPath("userData"), {
    ...current,
    naverSiteVerification,
    naverId,
    naverPassword,
    address,
    siteTheme,
  });

  let applied = false;
  if (cfg.opsMasterPassword && (current.siteUrl || current.vercelHost)) {
    applied = await applyBrandBootstrap(
      [current.vercelHost, current.siteUrl],
      {
        host: current.domain || current.publicHost,
        domain: current.domain || current.publicHost,
        ...(address ? { address } : {}),
        ...(siteTheme ? { siteTheme } : {}),
        ...(naverSiteVerification ? { naverSiteVerification } : {}),
      },
      cfg.opsMasterPassword,
      () => {},
      { bypassSecret: cfg.deploymentProtectionBypass }
    );
  }

  return { ok: true, sites: nextSites, applied };
});

ipcMain.handle("brand:open", async (_e, url) => {
  if (url) await shell.openExternal(String(url));
  return { ok: true };
});
