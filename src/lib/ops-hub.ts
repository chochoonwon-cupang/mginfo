const HUB_HOSTS = new Set(["magazine.infocs.co.kr", "mginfo.vercel.app"]);

function normalizeHost(raw: string) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .split(",")[0]
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
}

function flagValue() {
  return String(process.env.OPS_LEDGER || "").trim().toLowerCase();
}

function envHostCandidates() {
  return [
    process.env.SITE_DOMAIN,
    process.env.NEXT_PUBLIC_SITE_DOMAIN,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ].map((value) => normalizeHost(String(value || "")));
}

export function isHubHost(host?: string | null) {
  const h = normalizeHost(String(host || ""));
  if (HUB_HOSTS.has(h)) return true;
  // New Vercel team aliases: mginfo-phi.vercel.app, etc.
  return /^mginfo(-[a-z0-9-]+)?\.vercel\.app$/.test(h);
}

export async function isOpsHub() {
  const flag = flagValue();
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  if (envHostCandidates().some((host) => isHubHost(host))) return true;
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    if (isHubHost(h.get("x-forwarded-host") || h.get("host"))) return true;
  } catch {
    /* no request context */
  }
  const siteDomain = envHostCandidates()[0];
  return !process.env.VERCEL && !siteDomain;
}
