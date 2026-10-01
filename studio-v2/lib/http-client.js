/** API calls from Brand Studio → deployed Next sites (bootstrap, verify, sync). */

function sortStudioApiBases(bases) {
  const uniq = [
    ...new Set(
      (bases || [])
        .map((u) => String(u || "").replace(/\/$/, "").trim())
        .filter(Boolean)
    ),
  ];
  return uniq.sort((a, b) => {
    const aV = a.includes("vercel.app") ? 0 : 1;
    const bV = b.includes("vercel.app") ? 0 : 1;
    return aV - bV;
  });
}

function studioAuthHeaders(opts = {}) {
  const headers = {};
  const masterPassword = String(opts.masterPassword || "").trim();
  if (masterPassword) headers["x-infocs-master"] = masterPassword;
  const bypass = String(opts.bypassSecret || "").trim();
  if (bypass) {
    headers["x-vercel-protection-bypass"] = bypass;
    headers["x-vercel-set-bypass-cookie"] = "true";
  }
  return headers;
}

function mergeHeaders(base, extra) {
  return { ...base, ...extra };
}

function isProtectedDeployment(status, data) {
  if (status !== 401 && status !== 403) return false;
  const text = typeof data === "string" ? data : JSON.stringify(data || {});
  return /protected deployment/i.test(text);
}

function isAppUnauthorized(status, data) {
  if (status !== 401) return false;
  const err = data?.error;
  return err === "unauthorized" || err === "Unauthorized";
}

function describeHttpFailure(status, data) {
  if (isProtectedDeployment(status, data)) {
    return "Vercel 배포 보호(Protected deployment) — Studio 설정에 「배포 보호 우회 시크릿」을 넣거나, Vercel → Deployment Protection → Protection Bypass for Automation 을 생성하세요.";
  }
  if (isAppUnauthorized(status, data)) {
    return "마스터 비번 불일치 — Studio 「bootstrap 마스터 비번」이 해당 Vercel 프로젝트 환경변수 MASTER_PASSWORD 와 같아야 합니다 (기본 ybijour80).";
  }
  const err = data?.error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object") return JSON.stringify(err);
  if (typeof data?.message === "string") return data.message;
  return `HTTP ${status}`;
}

async function readJsonSafe(res) {
  return res.json().catch(() => ({}));
}

module.exports = {
  sortStudioApiBases,
  studioAuthHeaders,
  mergeHeaders,
  isProtectedDeployment,
  isAppUnauthorized,
  describeHttpFailure,
  readJsonSafe,
};
