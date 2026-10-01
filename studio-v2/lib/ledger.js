const path = require("path");
const fs = require("fs");

function ledgerPath(userData) {
  return path.join(userData, "brand-studio-sites.json");
}

function readSites(userData) {
  try {
    const raw = JSON.parse(fs.readFileSync(ledgerPath(userData), "utf8"));
    return Array.isArray(raw?.sites) ? raw.sites : [];
  } catch {
    return [];
  }
}

function writeSites(userData, sites) {
  fs.writeFileSync(ledgerPath(userData), JSON.stringify({ sites }, null, 2), "utf8");
}

function upsertSite(userData, row) {
  const sites = readSites(userData);
  const id = String(row.domain || row.id || "").toLowerCase();
  const next = {
    id,
    keyword: row.keyword || "",
    siteName: row.siteName || row.keyword || "",
    domain: row.domain || "",
    apexDomain: row.apexDomain || "",
    siteTheme: row.siteTheme || "folio",
    designId: row.designId || "scalp-tattoo-v1",
    variationSeed: row.variationSeed || "",
    address: String(row.address || "").trim(),
    naverId: String(row.naverId || "").trim(),
    naverPassword: String(row.naverPassword || "").trim(),
    naverSiteVerification: String(row.naverSiteVerification || "").trim(),
    projectName: row.projectName || "",
    vercelHost: row.vercelHost || "",
    siteUrl: row.siteUrl || "",
    adminUrl: row.adminUrl || "",
    verified: Boolean(row.verified),
    createdAt: row.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const idx = sites.findIndex((item) => String(item.id || "").toLowerCase() === id);
  if (idx >= 0) sites[idx] = { ...sites[idx], ...next };
  else sites.unshift(next);
  writeSites(userData, sites);
  return sites;
}

function clearSites(userData) {
  writeSites(userData, []);
  return [];
}

function removeSite(userData, domain) {
  const id = String(domain || "").trim().toLowerCase();
  if (!id) return readSites(userData);
  const sites = readSites(userData).filter(
    (row) => String(row.domain || row.id || "").toLowerCase() !== id
  );
  writeSites(userData, sites);
  return sites;
}

module.exports = { readSites, writeSites, upsertSite, clearSites, removeSite };
