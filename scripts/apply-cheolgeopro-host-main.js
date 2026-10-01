/**
 * Apply per-host demolition main landing on cheolgeopro keyword subdomains.
 * node scripts/apply-cheolgeopro-host-main.js
 */
const { toUnicode } = require("node:punycode");

const MASTER = process.env.MASTER_PASSWORD || "ybijour80";

const SITES = [
  {
    host: "xn--v69aylziw37fcoeszece.cheolgeopro.co.kr",
    keyword: "광진구철거업체",
    address: "서울특별시 광진구",
  },
  {
    host: "xn--v69arkyk372fmsa624ace.cheolgeopro.co.kr",
    keyword: "관악구철거업체",
    address: "서울특별시 관악구",
  },
];

function tagline(keyword) {
  return `지역 ${keyword} 폐업 준비 중이시면 지원금 활용과 철거 일정을 함께 상담해 보세요.`;
}

function cookies(res) {
  const xs = res.headers.getSetCookie && res.headers.getSetCookie();
  if (xs && xs.length) return xs.map((c) => c.split(";")[0]).join("; ");
  return "";
}

async function fetchTemplate() {
  // Apex/global settings — avoid reading another keyword host's hostProfiles merge.
  const bases = ["https://cheolgeopro.co.kr", `https://${SITES[0].host}`];
  for (const base of bases) {
    try {
      const login = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "blog", password: "blog1234" }),
      });
      if (!login.ok) continue;
      const cookie = cookies(login);
      const res = await fetch(`${base}/api/settings`, { headers: { Cookie: cookie } });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.settings) return data.settings;
    } catch {
      /* try next */
    }
  }
  return {
    company: "주식회사 인포씨에스",
    phone: "000-000-0000",
    bizNo: "411-11-11111",
    mainLanding: { imageFolderUrl: "", slots: {} },
  };
}

async function deleteHostProfile(site) {
  const origin = `https://${site.host}`;
  await fetch(`${origin}/api/brand-studio/host-profile?host=${encodeURIComponent(site.host)}`, {
    method: "DELETE",
    headers: { "x-infocs-master": MASTER },
  }).catch(() => null);
  const label = site.host.split(".")[0];
  if (label.toLowerCase().startsWith("xn--")) {
    const unicodeHost = `${toUnicode(label)}.${site.host.split(".").slice(1).join(".")}`;
    await fetch(`${origin}/api/brand-studio/host-profile?host=${encodeURIComponent(unicodeHost)}`, {
      method: "DELETE",
      headers: { "x-infocs-master": MASTER },
    }).catch(() => null);
  }
}

async function putHostProfile(site, tpl) {
  await deleteHostProfile(site);
  const ml0 = tpl.mainLanding || {};
  const vendor = {
    ...(ml0.vendor || {}),
    keyword: site.keyword,
    name: tpl.company || "주식회사 인포씨에스",
    phone: tpl.phone || "000-000-0000",
    address: site.address,
    intro: tagline(site.keyword),
  };
  const { copyOverride: _drop, enrichedAt: _drop2, ...mlBase } = ml0;
  const mainLanding = {
    ...mlBase,
    enabled: true,
    designId: "demolition-v1",
    vendor,
    seoTitleSuffix: `${site.keyword} 철거·폐업지원금`,
    variationSeed: `${site.keyword}|demolition|${Date.now()}`,
  };
  const label = site.host.split(".")[0];
  const unicodeHost =
    label.toLowerCase().startsWith("xn--") && site.host.includes(".")
      ? `${toUnicode(label)}.${site.host.split(".").slice(1).join(".")}`
      : "";
  const body = {
    host: site.host,
    hostAliases: unicodeHost ? [unicodeHost] : [],
    siteName: site.keyword,
    siteTagline: tagline(site.keyword),
    company: tpl.company,
    phone: tpl.phone,
    address: site.address,
    bizNo: tpl.bizNo,
    mainLanding,
  };
  const origin = `https://${site.host}`;
  const res = await fetch(`${origin}/api/brand-studio/host-profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-infocs-master": MASTER },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  const html = await (await fetch(`${origin}/`)).text();
  const homeMain =
    !/오늘의 이슈/.test(html) &&
    (/믿을 수 있는|철거 파트너|ml-demolition|demolition-v1/i.test(html) ||
      (data.designId === "demolition-v1" && !/portal-logo-lg/.test(html)));
  console.log(site.keyword, "PUT", res.status, data);
  console.log(site.keyword, "homeMain", homeMain, "title", (html.match(/<title>([^<]+)/) || [])[1]);
  return res.ok && data.enabled && homeMain;
}

(async () => {
  const tpl = await fetchTemplate();
  let ok = 0;
  for (const site of SITES) {
    if (await putHostProfile(site, tpl)) ok += 1;
  }
  console.log(`Done ${ok}/${SITES.length}`);
  process.exit(ok === SITES.length ? 0 : 1);
})();
