const crypto = require("crypto");
const { toASCII, toUnicode } = require("node:punycode");
const {
  sortStudioApiBases,
  studioAuthHeaders,
  mergeHeaders,
  describeHttpFailure,
  readJsonSafe,
} = require("./http-client");

const API = "https://api.vercel.com";
const {
  DEFAULT_REPO,
  DEFAULT_GIT_ORG,
  DEFAULT_TEAM_ID,
  DEFAULT_TEAM_SLUG,
} = require("./defaults");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** host-profile GET: punycode first (unicode host often 404/525 from Node fetch). */
function studioHostVerifyKeys(host, extra = []) {
  const raw = [...(Array.isArray(extra) ? extra : []), host]
    .map((h) =>
      String(h || "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
    )
    .filter(Boolean);
  const out = new Set();
  for (const h of raw) {
    out.add(h);
    const parts = h.split(".").filter(Boolean);
    if (parts.length < 2) continue;
    const label = parts[0];
    const apex = parts.slice(1).join(".");
    if (/[^\x00-\x7f]/.test(label)) {
      try {
        out.add(`${toASCII(label)}.${apex}`);
      } catch {
        /* ignore */
      }
    }
    if (label.startsWith("xn--")) {
      try {
        out.add(`${toUnicode(label)}.${apex}`);
      } catch {
        /* ignore */
      }
    }
  }
  return [...out].sort((a, b) => {
    const ax = a.split(".")[0]?.startsWith("xn--") ? 0 : 1;
    const bx = b.split(".")[0]?.startsWith("xn--") ? 0 : 1;
    return ax - bx;
  });
}

function domainFromProjectSlug(slug) {
  let value = String(slug || "").trim().toLowerCase();
  if (!value || value.includes(".")) return value;
  const tlds = [
    ["-co-kr", ".co.kr"],
    ["-or-kr", ".or.kr"],
    ["-go-kr", ".go.kr"],
    ["-ne-kr", ".ne.kr"],
    ["-re-kr", ".re.kr"],
    ["-com", ".com"],
    ["-net", ".net"],
    ["-org", ".org"],
    ["-kr", ".kr"],
  ];
  for (const [from, to] of tlds) {
    if (value.endsWith(from)) {
      value = value.slice(0, -from.length) + to;
      break;
    }
  }
  if (!value.includes(".")) return value.replace(/-/g, ".");
  const [host, ...rest] = value.split(".");
  if (host.includes("-")) value = `${host.replace(/-/g, ".")}.${rest.join(".")}`;
  return value;
}

function cleanDomain(raw) {
  let value = String(raw || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[。．｡]/g, ".")
    .replace(/\s+/g, "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase();
  if (value && !value.includes(".")) value = domainFromProjectSlug(value);
  return value;
}

function projectNameFromDomain(domain) {
  const slug = domain
    .replace(/^www\./, "")
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return slug || "magazine-site";
}

/** Shared Vercel project slug for all keyword subdomains under the same apex. */
function sharedProjectNameFromDomain(domain) {
  return projectNameFromDomain(registrableApexHost(domain));
}

function parseNaverVerification(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const fromContent = text.match(/content\s*=\s*["']([^"']+)["']/i);
  if (fromContent?.[1]) return fromContent[1].trim();
  const token = text.replace(/<[^>]+>/g, "").trim();
  if (/^[a-zA-Z0-9_-]{8,128}$/.test(token)) return token;
  return "";
}

async function applyNaverMeta(urls, code, masterPassword, onLog, opts = {}) {
  const verification = parseNaverVerification(code);
  if (!verification) return;
  const secret = String(masterPassword || "").trim() || "ybijour80";
  const bases = sortStudioApiBases(urls);
  const auth = studioAuthHeaders({ masterPassword: secret, bypassSecret: opts.bypassSecret });
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/api/ops/board`, {
        method: "PATCH",
        headers: mergeHeaders({ "Content-Type": "application/json" }, auth),
        body: JSON.stringify({ naverSiteVerification: verification }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        onLog("네이버 사이트 인증 메타를 적용했습니다.");
        return;
      }
    } catch {
      /* try next host */
    }
  }
  onLog("네이버 메타는 환경변수로 넣었습니다. 첫 접속 후 head에 반영됩니다.");
}

function apiError(data, fallback) {
  return data?.error?.message || data?.message || fallback;
}

async function vercel(token, path, { method = "GET", body, teamId } = {}) {
  const url = new URL(API + path);
  if (teamId) url.searchParams.set("teamId", teamId);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(apiError(data, `Vercel 요청 실패 (${res.status})`));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function waitForDeployment(token, teamId, id, onLog) {
  for (let i = 0; i < 90; i += 1) {
    const row = await vercel(token, `/v13/deployments/${id}`, { teamId });
    const state = row.readyState || row.status || "";
    if (state === "READY") return row;
    if (state === "ERROR" || state === "CANCELED") {
      throw new Error(row.errorMessage || "배포가 실패했습니다.");
    }
    if (i === 0 || i % 3 === 0) onLog(`배포 상태: ${state || "대기"}`);
    await sleep(4000);
  }
  throw new Error("배포가 너무 오래 걸립니다. Vercel 대시보드에서 확인해 주세요.");
}

async function getProject(token, teamId, idOrName) {
  return vercel(token, `/v9/projects/${encodeURIComponent(idOrName)}`, { teamId });
}

/**
 * Brand Studio calls bootstrap APIs without a browser login.
 * Newer Vercel projects often ship with Vercel Authentication ON — disable for clone sites.
 */
async function ensureBootstrapReachable(token, teamId, projectId, onLog = () => {}) {
  try {
    await vercel(token, `/v9/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      teamId,
      body: { ssoProtection: null },
    });
    onLog("Vercel Authentication(배포 보호)를 꺼 두었습니다 — Studio가 메인 설정 API에 접근합니다.");
    return true;
  } catch (err) {
    onLog(`배포 보호 자동 해제 실패: ${err.message || err} (우회 시크릿 또는 대시보드에서 보호 해제)`);
    return false;
  }
}

async function latestDeployment(token, teamId, projectId) {
  const data = await vercel(token, `/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=5`, { teamId });
  const rows = data.deployments || [];
  return rows[0] || null;
}

function gitSourceFrom(project, repo) {
  const link = project.link || {};
  if (link.repoId) {
    return { type: "github", ref: link.productionBranch || "main", repoId: link.repoId };
  }
  const [org, name] = String(repo).split("/");
  return {
    type: "github",
    ref: "main",
    org: org || DEFAULT_GIT_ORG,
    repo: name || repo,
  };
}

function isApexDomain(domain) {
  const host = String(domain || "")
    .toLowerCase()
    .replace(/^www\./, "");
  const parts = host.split(".").filter(Boolean);
  const last2 = parts.slice(-2).join(".");
  if (["co.kr", "or.kr", "go.kr", "ne.kr", "re.kr", "ac.kr"].includes(last2)) {
    return parts.length === 3;
  }
  return parts.length === 2;
}

/** Apex sites use www as the public canonical host (Naver Search Advisor). */
function canonicalPublicHost(domain) {
  const host = String(domain || "")
    .toLowerCase()
    .replace(/^www\./, "");
  if (!host) return "";
  return isApexDomain(host) ? `www.${host}` : host;
}

function apexHost(domain) {
  return String(domain || "")
    .toLowerCase()
    .replace(/^www\./, "");
}

/** Registrable apex (e.g. keyword.cheolgeopro.co.kr → cheolgeopro.co.kr). */
function registrableApexHost(domain) {
  const host = apexHost(cleanDomain(domain));
  if (!host) return "";
  if (isApexDomain(host)) return host;
  const parts = host.split(".").filter(Boolean);
  const last2 = parts.slice(-2).join(".");
  if (["co.kr", "or.kr", "go.kr", "ne.kr", "re.kr", "ac.kr"].includes(last2)) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

function dnsHostLabel(domain) {
  if (isApexDomain(domain)) return "@";
  const parts = String(domain || "").split(".").filter(Boolean);
  const last2 = parts.slice(-2).join(".");
  if (["co.kr", "or.kr", "go.kr", "ne.kr", "re.kr", "ac.kr"].includes(last2)) {
    return parts.slice(0, -2).join(".");
  }
  return parts.slice(0, -2).join(".") || parts[0];
}

function projectDomains(data) {
  if (Array.isArray(data?.domains)) return data.domains;
  if (Array.isArray(data)) return data;
  return [];
}

async function listProjectDomains(token, teamId, projectId) {
  const data = await vercel(token, `/v9/projects/${projectId}/domains?limit=100`, { teamId });
  return projectDomains(data);
}

async function getProjectDomain(token, teamId, projectId, domain) {
  const rows = await listProjectDomains(token, teamId, projectId);
  return rows.find((row) => String(row.name || "").toLowerCase() === domain) || null;
}

function domainAlreadyTaken(err) {
  const msg = String(err?.message || "");
  return /already in use|already assigned|exists|connected/i.test(msg);
}

async function findProjectByName(token, teamId, projectName) {
  try {
    return await getProject(token, teamId, projectName);
  } catch (err) {
    if (err.status === 404 || /not found|couldn't find|cannot find|does not exist/i.test(String(err.message || ""))) {
      return null;
    }
    throw err;
  }
}

async function dnsGuidance(token, teamId, projectId, domain, domainInfo) {
  let config = {};
  try {
    config = await vercel(
      token,
      `/v6/domains/${encodeURIComponent(domain)}/config?projectIdOrName=${encodeURIComponent(projectId)}`,
      { teamId }
    );
  } catch {
    config = {};
  }

  const rows = [];
  const cname = (config.recommendedCNAME || []).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99))[0];
  const ipv4 = (config.recommendedIPv4 || []).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99))[0];
  if (cname?.value) {
    rows.push({
      type: "CNAME",
      name: dnsHostLabel(domain),
      value: Array.isArray(cname.value) ? cname.value[0] : String(cname.value),
      reason: "도메인 업체 DNS에 이 CNAME을 넣으면 연결됩니다.",
    });
  } else if (ipv4?.value) {
    const ips = Array.isArray(ipv4.value) ? ipv4.value : [ipv4.value];
    rows.push({
      type: "A",
      name: dnsHostLabel(domain),
      value: ips.filter(Boolean).join(" / "),
      reason: "루트 도메인은 A 레코드로 연결합니다.",
    });
  }
  for (const row of domainInfo.verification || []) {
    rows.push({
      type: row.type || "TXT",
      name: row.domain || row.name || domain,
      value: row.value,
      reason: row.reason || "소유 확인용 레코드",
    });
  }
  if (!rows.length && !domainInfo.verified) {
    rows.push({
      type: isApexDomain(domain) ? "A" : "CNAME",
      name: dnsHostLabel(domain),
      value: isApexDomain(domain) ? "76.76.21.21" : "cname.vercel-dns.com",
      reason: "도메인 업체 DNS에 이 값을 넣으면 Vercel이 인증합니다.",
    });
  }
  return {
    rows,
    misconfigured: Boolean(config.misconfigured),
    configuredBy: config.configuredBy || null,
    verified: Boolean(domainInfo.verified),
  };
}

async function attachDomain(token, teamId, projectId, domain, onLog, { redirectTo = null, redirectStatusCode = 301 } = {}) {
  let info = await getProjectDomain(token, teamId, projectId, domain);
  if (info) {
    onLog(`도메인이 이 프로젝트에 있습니다. 인증 상태: ${info.verified ? "완료" : "대기"}`);
  } else {
    onLog(`도메인 연결: ${domain}`);
    try {
      const body = { name: domain };
      if (redirectTo) {
        body.redirect = redirectTo;
        body.redirectStatusCode = redirectStatusCode;
      }
      info = await vercel(token, `/v10/projects/${projectId}/domains`, {
        method: "POST",
        teamId,
        body,
      });
      onLog("도메인을 이 프로젝트에 등록했습니다.");
    } catch (err) {
      const mine = await getProjectDomain(token, teamId, projectId, domain);
      if (mine) {
        info = mine;
        onLog("도메인이 이 프로젝트에 이미 등록되어 있습니다.");
      } else if (domainAlreadyTaken(err)) {
        onLog("도메인이 이미 다른 곳에 연결되어 있어 이동하지 않습니다.");
        return {
          name: domain,
          verified: false,
          dns: [],
          alreadyConnected: true,
        };
      } else {
        throw new Error(`도메인을 Vercel 프로젝트에 연결하지 못했습니다. ${err.message}`);
      }
    }
  }

  if (!info?.name) {
    info = await getProjectDomain(token, teamId, projectId, domain);
  }
  if (!info?.name) {
    return { name: domain, verified: false, dns: [], alreadyConnected: true };
  }

  if (!info.verified) {
    try {
      const verified = await vercel(
        token,
        `/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}/verify`,
        { method: "POST", teamId }
      );
      if (verified?.verified) {
        info = verified;
        onLog("도메인 인증이 완료되었습니다.");
      }
    } catch {
      onLog("도메인은 등록됐습니다. DNS가 맞으면 인증이 완료됩니다.");
    }
  }

  if (redirectTo) {
    const currentRedirect = String(info.redirect || "").toLowerCase();
    if (currentRedirect !== String(redirectTo).toLowerCase() || Number(info.redirectStatusCode) !== redirectStatusCode) {
      try {
        info = await vercel(token, `/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}`, {
          method: "PATCH",
          teamId,
          body: { redirect: redirectTo, redirectStatusCode },
        });
        onLog(`${domain} → ${redirectTo} (${redirectStatusCode}) 리다이렉트를 설정했습니다.`);
      } catch (err) {
        onLog(`리다이렉트 설정 안내: ${err.message}`);
      }
    }
  }

  const dns = await dnsGuidance(token, teamId, projectId, domain, info);
  if (dns.verified) onLog("도메인 연결이 완료되었습니다.");
  else onLog("Vercel에는 연결했습니다. 도메인 업체에서 아래 DNS만 맞추면 열립니다.");
  return { ...info, dns: dns.rows, misconfigured: dns.misconfigured, alreadyConnected: false };
}

/**
 * Apex: www is primary (200), apex permanently redirects to www.
 * Subdomain: attach as-is (no www policy).
 */
async function attachPublicDomains(token, teamId, projectId, domain, onLog) {
  const apex = apexHost(domain);
  const canonical = canonicalPublicHost(apex);
  if (!isApexDomain(apex)) {
    return attachDomain(token, teamId, projectId, apex, onLog);
  }

  onLog(`apex 도메인은 www를 대표주소로 사용합니다: ${canonical}`);
  const wwwInfo = await attachDomain(token, teamId, projectId, canonical, onLog);
  const apexInfo = await attachDomain(token, teamId, projectId, apex, onLog, {
    redirectTo: canonical,
    redirectStatusCode: 301,
  });
  const dns = [
    ...(wwwInfo.dns || []),
    ...(apexInfo.dns || []).filter((row) => !(wwwInfo.dns || []).some((w) => w.type === row.type && w.name === row.name)),
  ];
  // Prefer www DNS tip: CNAME www → vercel
  if (!dns.some((row) => String(row.name || "").toLowerCase() === "www")) {
    dns.unshift({
      type: "CNAME",
      name: "www",
      value: "cname.vercel-dns.com",
      reason: "www 대표주소를 Vercel에 연결합니다. apex(@)는 www로 301 됩니다.",
    });
  }
  return {
    ...wwwInfo,
    name: canonical,
    apexName: apex,
    dns,
    misconfigured: Boolean(wwwInfo.misconfigured || apexInfo.misconfigured),
    alreadyConnected: Boolean(wwwInfo.alreadyConnected && apexInfo.alreadyConnected),
    verified: Boolean(wwwInfo.verified),
  };
}

async function assignDomainAlias(token, teamId, deploymentId, domain, onLog) {
  if (!deploymentId) return;
  try {
    await vercel(token, `/v2/deployments/${deploymentId}/aliases`, {
      method: "POST",
      teamId,
      body: { alias: domain },
    });
    onLog(`배포에 도메인을 붙였습니다: ${domain}`);
  } catch (err) {
    onLog(`도메인 별칭 안내: ${err.message}`);
  }
}

async function startOrWaitDeploy(token, teamId, project, projectName, repo, onLog, { reuseExisting } = {}) {
  const projectId = project.id || projectName;
  await sleep(2000);
  let current = await latestDeployment(token, teamId, projectId);
  if (reuseExisting && current?.readyState === "READY") {
    onLog("기존 배포를 그대로 사용합니다.");
    return current;
  }
  if (current && current.readyState !== "ERROR" && current.readyState !== "CANCELED") {
    onLog("이미 시작된 배포를 기다립니다…");
    return waitForDeployment(token, teamId, current.uid || current.id, onLog);
  }

  onLog("프로덕션 배포를 요청합니다…");
  const created = await vercel(token, "/v13/deployments?skipAutoDetectionConfirmation=1", {
    method: "POST",
    teamId,
    body: {
      name: projectName,
      project: projectId,
      target: "production",
      gitSource: gitSourceFrom(project, repo),
    },
  });
  return waitForDeployment(token, teamId, created.id || created.uid, onLog);
}

async function provisionSite(input, onLog = () => {}) {
  const token = String(input.token || "").trim();
  let domain = apexHost(cleanDomain(input.domain));
  const domainFromName = apexHost(cleanDomain(input.blogName));
  if ((!domain || !domain.includes(".")) && domainFromName.includes(".")) {
    domain = domainFromName;
  }
  let blogName = String(input.blogName || "").trim();
  if (!blogName || blogName === input.domain || domainFromName === domain) {
    blogName = domain.split(".")[0] || blogName || "매거진";
  }
  const repo = String(input.repo || DEFAULT_REPO).trim() || DEFAULT_REPO;
  let teamId = String(input.teamId || "").trim();
  const naverSiteVerification = parseNaverVerification(input.naverSiteVerification);
  const masterPassword = String(input.masterPassword || "").trim();
  const geminiApiKey = String(input.geminiApiKey || "").trim();
  const geminiModel = String(input.geminiModel || "").trim();
  const publicHost = canonicalPublicHost(domain);

  if (!token) throw new Error("Vercel 토큰을 먼저 저장하세요.");
  if (!domain || !domain.includes(".")) {
    throw new Error("도메인을 올바르게 입력하세요. 예: magazine.agapet.co.kr");
  }

  onLog(`도메인: ${domain}${publicHost !== domain ? ` (대표: ${publicHost})` : ""}`);
  onLog("계정 확인 중…");
  if (!teamId) {
    try {
      const verified = await verifyToken(token, "");
      teamId = verified.defaultTeamId || DEFAULT_TEAM_ID;
    } catch {
      teamId = DEFAULT_TEAM_ID;
    }
  }

  const singleProjectPerApex =
    input.singleProjectPerApex !== false && input.singleProjectPerApex !== "false";
  const projectName = singleProjectPerApex
    ? String(input.sharedProjectName || "").trim() || sharedProjectNameFromDomain(domain)
    : projectNameFromDomain(domain);
  const apexForEnv = singleProjectPerApex ? registrableApexHost(domain) : apexHost(domain);
  const projectSiteDomain = canonicalPublicHost(apexForEnv);
  if (singleProjectPerApex) {
    onLog(`단일 프로젝트 모드: ${projectName} (키워드 도메인만 추가)`);
  }
  onLog(`프로젝트 확인: ${projectName}`);
  let reused = false;
  let project = await findProjectByName(token, teamId, projectName);
  if (project) {
    onLog("이미 프로젝트가 있습니다.");
    const confirm = input.confirmExistingProject;
    const go = typeof confirm === "function" ? await confirm(projectName) : false;
    if (!go) {
      throw new Error("생성을 중지했습니다. 기존 프로젝트는 그대로 두었습니다.");
    }
    reused = true;
    onLog("기존 프로젝트를 유지합니다. 덮어쓰지 않습니다.");
  } else {
    const authSecret = crypto.randomBytes(32).toString("hex");
    const iconSeed = crypto.randomBytes(8).toString("hex");
    onLog(`프로젝트 생성: ${projectName}`);
    const environmentVariables = [
      { key: "AUTH_SECRET", value: authSecret, type: "encrypted", target: ["production", "preview", "development"] },
      {
        key: "SITE_NAME",
        value: singleProjectPerApex ? apexForEnv.split(".")[0] || blogName : blogName,
        type: "plain",
        target: ["production", "preview", "development"],
      },
      {
        key: "SITE_DOMAIN",
        value: singleProjectPerApex ? projectSiteDomain : publicHost,
        type: "plain",
        target: ["production", "preview", "development"],
      },
      { key: "SITE_ICON_SEED", value: iconSeed, type: "plain", target: ["production", "preview", "development"] },
    ];
    if (masterPassword) {
      environmentVariables.push({
        key: "MASTER_PASSWORD",
        value: masterPassword,
        type: "encrypted",
        target: ["production", "preview", "development"],
      });
    }
    const siteTagline = String(input.siteTagline || "").trim();
    if (siteTagline) {
      environmentVariables.push({
        key: "SITE_TAGLINE",
        value: siteTagline,
        type: "plain",
        target: ["production", "preview", "development"],
      });
    }
    if (geminiApiKey) {
      environmentVariables.push({
        key: "GEMINI_API_KEY",
        value: geminiApiKey,
        type: "encrypted",
        target: ["production", "preview", "development"],
      });
      onLog("제미나이 API 키를 환경변수로 등록했습니다.");
    }
    if (geminiModel) {
      environmentVariables.push({
        key: "GEMINI_MODEL",
        value: geminiModel,
        type: "plain",
        target: ["production", "preview", "development"],
      });
    }
    if (naverSiteVerification) {
      environmentVariables.push({
        key: "NAVER_SITE_VERIFICATION",
        value: naverSiteVerification,
        type: "plain",
        target: ["production", "preview", "development"],
      });
      onLog("네이버 사이트 인증 메타를 환경변수로 등록했습니다.");
    }
    try {
      project = await vercel(token, "/v11/projects", {
        method: "POST",
        teamId,
        body: {
          name: projectName,
          framework: "nextjs",
          gitRepository: { type: "github", repo },
          environmentVariables,
        },
      });
      onLog("이 사이트 전용 파비콘 시드를 등록했습니다.");
    } catch (err) {
      const msg = String(err.message || "");
      if (msg.includes("GitHub")) {
        throw new Error("GitHub 연동이 필요합니다. Vercel에 GitHub 앱을 연결한 뒤 다시 시도하세요.");
      }
      throw err;
    }
  }
  project = await getProject(token, teamId, project.id || projectName);
  const projectId = project.id || projectName;

  await ensureBootstrapReachable(token, teamId, projectId, onLog);

  if (reused) {
    onLog("기존 Blob·환경변수는 그대로 둡니다.");
    if (masterPassword) {
      try {
        const envList = await vercel(token, `/v9/projects/${encodeURIComponent(projectId)}/env`, { teamId });
        const rows = Array.isArray(envList?.envs) ? envList.envs : Array.isArray(envList) ? envList : [];
        const existing = rows.find((row) => row.key === "MASTER_PASSWORD");
        if (existing?.id) {
          await vercel(token, `/v9/projects/${encodeURIComponent(projectId)}/env/${existing.id}`, {
            method: "PATCH",
            teamId,
            body: { value: masterPassword },
          });
        } else {
          await vercel(token, `/v10/projects/${encodeURIComponent(projectId)}/env`, {
            method: "POST",
            teamId,
            body: {
              key: "MASTER_PASSWORD",
              value: masterPassword,
              type: "encrypted",
              target: ["production", "preview", "development"],
            },
          });
        }
        onLog("MASTER_PASSWORD 환경변수를 Studio 마스터 비번과 맞췄습니다.");
      } catch (err) {
        onLog(`MASTER_PASSWORD 갱신 안내: ${err.message || err}`);
      }
    }
    if (naverSiteVerification) {
      try {
        await vercel(token, `/v10/projects/${encodeURIComponent(projectId)}/env`, {
          method: "POST",
          teamId,
          body: {
            key: "NAVER_SITE_VERIFICATION",
            value: naverSiteVerification,
            type: "plain",
            target: ["production", "preview", "development"],
          },
        });
        onLog("네이버 사이트 인증 메타 환경변수를 추가했습니다.");
      } catch (err) {
        onLog(`네이버 메타 환경변수 안내: ${err.message}`);
      }
    }
    if (geminiApiKey) {
      try {
        await vercel(token, `/v10/projects/${encodeURIComponent(projectId)}/env`, {
          method: "POST",
          teamId,
          body: {
            key: "GEMINI_API_KEY",
            value: geminiApiKey,
            type: "encrypted",
            target: ["production", "preview", "development"],
          },
        });
        onLog("제미나이 API 키 환경변수를 추가·갱신했습니다.");
      } catch (err) {
        onLog(`제미나이 키 환경변수 안내: ${err.message}`);
      }
    }
  } else {
    onLog("Blob 저장소 생성 중…");
    const storeName = `blob-${projectName}`.slice(0, 70);
    let blob = { store: {} };
    try {
      blob = await vercel(token, "/v1/storage/stores/blob", {
        method: "POST",
        teamId,
        body: {
          name: storeName,
          region: "icn1",
          access: "public",
          projectId,
          version: "2",
        },
      });
    } catch (first) {
      try {
        blob = await vercel(token, "/v1/storage/stores/blob", {
          method: "POST",
          teamId,
          body: {
            name: storeName,
            access: "public",
            projectId,
            version: "2",
          },
        });
      } catch (err) {
        onLog(`Blob 안내: ${err.message || first.message}`);
      }
    }
    const store = blob.store || blob;
    const storeId = store.id;
    if (storeId) {
      try {
        onLog("Blob을 프로젝트에 연결 중…");
        await vercel(token, `/v1/storage/stores/${storeId}/connections`, {
          method: "POST",
          teamId,
          body: {
            projectId,
            type: "integration",
            envVarEnvironments: ["production", "preview", "development"],
          },
        });
      } catch (err) {
        onLog(`Blob 연결 안내: ${err.message}`);
      }
    }
  }

  const domainInfo = await attachPublicDomains(token, teamId, projectId, domain, onLog);

  // Ensure existing projects also use www canonical for apex hosts.
  if (reused && isApexDomain(domain)) {
    try {
      const envList = await vercel(token, `/v9/projects/${encodeURIComponent(projectId)}/env`, { teamId });
      const rows = Array.isArray(envList?.envs) ? envList.envs : Array.isArray(envList) ? envList : [];
      const siteDomainEnv = rows.find((row) => row.key === "SITE_DOMAIN");
      if (siteDomainEnv?.id && String(siteDomainEnv.value || "") !== publicHost) {
        await vercel(token, `/v9/projects/${encodeURIComponent(projectId)}/env/${siteDomainEnv.id}`, {
          method: "PATCH",
          teamId,
          body: { value: publicHost },
        });
        onLog(`SITE_DOMAIN을 ${publicHost}로 맞췄습니다.`);
      }
    } catch (err) {
      onLog(`SITE_DOMAIN 안내: ${err.message}`);
    }
  }

  onLog(reused ? "기존 배포를 확인합니다…" : "프로덕션 배포 시작…");
  const wantFreshCode = input.deployProduction === true;
  const ready = await startOrWaitDeploy(token, teamId, project, projectName, repo, onLog, {
    reuseExisting: !wantFreshCode && reused && !naverSiteVerification,
  });
  if (wantFreshCode) onLog("최신 mginfo 코드로 프로덕션 배포를 요청했습니다 (철거·호스트별 메인).");
  if (!domainInfo.alreadyConnected) {
    await assignDomainAlias(token, teamId, ready.id || ready.uid, publicHost, onLog);
    if (publicHost !== domain) {
      await assignDomainAlias(token, teamId, ready.id || ready.uid, domain, onLog);
    }
  }

  const vercelHost = ready.url ? `https://${ready.url}` : `https://${projectName}.vercel.app`;
  const siteUrl = `https://${publicHost}`;
  const adminUrl = domainInfo.verified ? `https://${publicHost}/admin` : `${vercelHost}/admin`;

  if (naverSiteVerification) {
    onLog("네이버 메타 반영을 확인합니다…");
    await sleep(2500);
    await applyNaverMeta([vercelHost, siteUrl], naverSiteVerification, masterPassword, onLog, {
      bypassSecret: input.deploymentProtectionBypass,
    });
  }

  onLog("완료되었습니다.");
  return {
    blogName,
    domain,
    publicHost,
    projectName,
    projectId,
    vercelHost,
    siteUrl,
    adminUrl,
    verified: Boolean(domainInfo.verified),
    alreadyConnected: Boolean(domainInfo.alreadyConnected),
    reused,
    dns: domainInfo.dns || [],
    createdAt: new Date().toISOString(),
  };
}

function formatBootstrapError(status, data, fallback) {
  return describeHttpFailure(status, data) || fallback;
}

function normalizeHostForCompare(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function bootstrapSaveVerified(data, expectHost, expectKeyword, expectDesignId, hostCandidates = []) {
  if (data?.error) return false;
  if (data?.ok === false) return false;
  const verify = data.verify;
  if (verify && typeof verify === "object" && verify.mainLandingEnabled) {
    const kw = String(verify.keyword || "").trim();
    if (expectKeyword && kw && kw !== expectKeyword) return false;
    const design = String(verify.designId || "").trim();
    if (expectDesignId && design && design !== expectDesignId) return false;
    return true;
  }
  if (data?.ok === true && !data?.multiHost) return true;
  if (data?.ok === true && data?.multiHost && expectHost && expectDesignId) {
    return false;
  }
  if (data?.ok === true && data?.multiHost) {
    return Boolean(data.verify?.mainLandingEnabled);
  }
  return false;
}

async function applyBrandBootstrap(urls, payload, masterPassword, onLog = () => {}, opts = {}) {
  const secret = String(masterPassword || "").trim();
  if (!secret) {
    onLog("마스터 비번이 없어 메인랜딩 설정을 건너뜁니다.");
    return false;
  }
  const bypassSecret = String(opts.bypassSecret || "").trim();
  const bases = sortStudioApiBases(urls);
  const auth = studioAuthHeaders({ masterPassword: secret, bypassSecret });
  const incoming = payload || {};
  const body = {
    enrich: true,
    ...incoming,
    // Studio 대량생성: 메인 디자인은 항상 ON
    mainLanding:
      incoming.mainLanding !== undefined
        ? { ...incoming.mainLanding, enabled: true }
        : incoming.mainLanding,
  };

  const expectKeyword = String(body.mainLanding?.vendor?.keyword || body.siteName || "").trim();
  const expectHost = String(body.host || body.domain || "").trim();
  const expectDesignId = String(body.mainLanding?.designId || "").trim();
  if (body.mainLanding !== undefined && !expectHost) {
    onLog("오류: bootstrap host(키워드 서브도메인)가 비어 있습니다.");
    return false;
  }

  const hostCandidates = Array.isArray(opts.hostCandidates) ? opts.hostCandidates : [];
  const verifyOpts = {
    host: expectHost,
    hostCandidates,
    masterPassword: secret,
    bypassSecret,
    expectDesignId,
    onLog,
  };
  const bootstrapJson = {
    ...body,
    ...(Array.isArray(body.vendorGroups) && body.vendorGroups.length ? { vendorGroups: body.vendorGroups } : {}),
  };

  let lastBootstrap = null;
  let saveOk = false;

  for (let saveAttempt = 0; saveAttempt < 3 && !saveOk; saveAttempt += 1) {
    if (saveAttempt > 0) {
      onLog(`메인 저장 재시도 (${saveAttempt + 1}/3)…`);
      await sleep(3000);
    }
    for (const base of bases) {
      try {
        const res = await fetch(`${base}/api/brand-studio/bootstrap`, {
          method: "POST",
          headers: mergeHeaders({ "Content-Type": "application/json" }, auth),
          body: JSON.stringify(bootstrapJson),
          signal: AbortSignal.timeout(120000),
        });
        const data = await readJsonSafe(res);
        lastBootstrap = { data, base, resOk: res.ok };
        if (!res.ok) {
          onLog(`설정 적용 대기 (${res.status}): ${formatBootstrapError(res.status, data, base)}`);
          continue;
        }
        if (data?.ok === false || data?.error) {
          onLog(`bootstrap 저장 실패: ${data.error || "host profile 미저장"} (${base})`);
          continue;
        }
        if (data.enriched) onLog(`메인 디자인 ON + 제미나이 내용 보충 완료: ${base}`);
        else if (data.enrichError) onLog(`메인 디자인 ON 적용. 내용 보충 보류: ${data.enrichError}`);
        else onLog(`메인 디자인 ON · 블로그 설정을 적용했습니다: ${base}`);
        saveOk = true;
        break;
      } catch (err) {
        onLog(`설정 적용 재시도: ${err.message || base}`);
      }
    }
  }

  if (!saveOk && !lastBootstrap?.resOk) {
    onLog(
      "배포는 됐지만 메인 디자인(ON) 자동 적용에 실패했습니다. Vercel 배포 보호 우회 시크릿·MASTER_PASSWORD 를 확인하거나 관리자에서 메인 랜딩을 켜 주세요."
    );
    return false;
  }

  await sleep(2000);

  for (let verifyAttempt = 0; verifyAttempt < 8; verifyAttempt += 1) {
    if (verifyAttempt > 0) {
      await sleep(2500);
    }
    const data = lastBootstrap?.data;
    const base = lastBootstrap?.base || bases[0];
    if (
      data &&
      bootstrapSaveVerified(data, expectHost, expectKeyword, expectDesignId, hostCandidates)
    ) {
      onLog(`메인 디자인 저장 확인 완료 (bootstrap): ${base}`);
      return true;
    }
    const verified = await verifyMainLanding(bases, expectKeyword, verifyOpts);
    if (verified.ok) {
      onLog(`메인 디자인 저장 확인 완료 (host-profile): ${verified.via || base}`);
      return true;
    }
    onLog(`메인 확인 대기 (${verifyAttempt + 1}/8): ${verified.reason || "host-profile"}`);
  }
  onLog(
    "배포는 됐지만 메인 디자인(ON) 자동 적용에 실패했습니다. Vercel 배포 보호 우회 시크릿·MASTER_PASSWORD 를 확인하거나 관리자에서 메인 랜딩을 켜 주세요."
  );
  return false;
}

/** Per-host profile (multi-tenant) or legacy blog settings. */
async function verifyMainLanding(baseUrls, expectKeyword = "", opts = {}) {
  const bases = sortStudioApiBases(Array.isArray(baseUrls) ? baseUrls : [baseUrls]);
  const host = String(opts.host || "").trim();
  const hostCandidates = studioHostVerifyKeys(host, opts.hostCandidates);
  const masterPassword = String(opts.masterPassword || "").trim();
  const bypassSecret = String(opts.bypassSecret || "").trim();
  const expectDesignId = String(opts.expectDesignId || "").trim();
  const onLog = typeof opts.onLog === "function" ? opts.onLog : () => {};
  const auth = studioAuthHeaders({ masterPassword, bypassSecret });
  let lastStatus = "";

  if (hostCandidates.length && masterPassword) {
    for (const base of bases) {
      for (const hostKey of hostCandidates) {
      try {
        const res = await fetch(
          `${base}/api/brand-studio/host-profile?host=${encodeURIComponent(hostKey)}`,
          {
            headers: auth,
            signal: AbortSignal.timeout(20000),
          }
        );
        const data = await readJsonSafe(res);
        if (!res.ok) {
          lastStatus = `host-profile ${res.status} @ ${hostKey}`;
          if ((res.status === 404 || res.status === 525) && data.found === false) {
            continue;
          }
          if (res.status === 525) {
            continue;
          }
          continue;
        }
        if (!data.enabled) {
          return { ok: false, reason: "메인 랜딩 enabled=false", via: base };
        }
        const kw = String(data.keyword || "").trim();
        if (expectKeyword && kw && kw !== expectKeyword) {
          return { ok: false, reason: `키워드 불일치 (저장=${kw}, 기대=${expectKeyword})`, via: base };
        }
        if (!kw && expectKeyword) {
          return { ok: false, reason: "키워드가 저장되지 않음", via: base };
        }
        const savedDesign = String(data.designId || "").trim();
        if (expectDesignId && savedDesign && savedDesign !== expectDesignId) {
          return {
            ok: false,
            reason: `디자인 불일치 (저장=${savedDesign}, 기대=${expectDesignId})`,
            via: base,
          };
        }
        return { ok: true, via: base };
      } catch (err) {
        onLog(`저장 확인 재시도 (${base}): ${err.message || err}`);
      }
      }
    }
    return {
      ok: false,
      reason: lastStatus
        ? `host-profile 확인 대기 (${lastStatus}) — punycode URL로 재시도 중이거나 Blob 반영 지연`
        : "host-profile API 응답 없음",
    };
  }
  for (const base of bases) {
    try {
      const login = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: mergeHeaders({ "Content-Type": "application/json" }, auth),
        body: JSON.stringify({ username: "blog", password: "blog1234" }),
        signal: AbortSignal.timeout(20000),
      });
      if (!login.ok) continue;
      let cookie = "";
      if (typeof login.headers.getSetCookie === "function") {
        cookie = login.headers
          .getSetCookie()
          .map((c) => String(c).split(";")[0])
          .join("; ");
      }
      const res = await fetch(`${base}/api/settings`, {
        headers: mergeHeaders(cookie ? { Cookie: cookie } : {}, auth),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => ({}));
      const ml = data?.settings?.mainLanding || {};
      if (ml.enabled !== true) continue;
      const kw = String(ml.vendor?.keyword || "").trim();
      if (expectKeyword && kw && kw !== expectKeyword) continue;
      if (!kw && expectKeyword) continue;
      if (expectDesignId && ml.designId && ml.designId !== expectDesignId) continue;
      return { ok: true, via: base };
    } catch {
      /* next base */
    }
  }
  return { ok: false, reason: "legacy settings 확인 실패" };
}

async function verifyToken(token, teamId) {
  const user = await vercel(token, "/v2/user", { teamId });
  let teams = [];
  try {
    const list = await vercel(token, "/v2/teams", { teamId });
    teams = list.teams || [];
  } catch {
    teams = [];
  }
  const account = user.user || user;
  const mapped = teams.map((team) => ({ id: team.id, name: team.name, slug: team.slug }));
  const preferred =
    mapped.find((t) => t.slug === DEFAULT_TEAM_SLUG) ||
    mapped.find((t) => t.id === DEFAULT_TEAM_ID) ||
    mapped[0];
  return {
    name: account.name || account.username || "Vercel",
    username: account.username || "",
    teams: mapped,
    defaultTeamId: preferred?.id || DEFAULT_TEAM_ID,
  };
}

module.exports = {
  DEFAULT_REPO,
  cleanDomain,
  sharedProjectNameFromDomain,
  provisionSite,
  applyBrandBootstrap,
  verifyMainLanding,
  verifyToken,
};
