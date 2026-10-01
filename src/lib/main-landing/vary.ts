import { applyCopyOverride } from "./copy-override";
import { applyPooledMainLandingCopy } from "./copy-pool";
import { buildMainLandingDesignBase } from "./build-base";
import type {
  DemolitionBlockId,
  MainLandingConfig,
  MainLandingCopy,
  MainLandingSectionId,
  MainLandingTheme,
} from "./types";

const THEMES: MainLandingTheme[] = [
  { accent: "#0a3d3c", teal: "#1bb8a9", tealDeep: "#0f8578", soft: "#cceee9", bg: "#ecf6f4" },
  { accent: "#0c3d4a", teal: "#1aa8b8", tealDeep: "#0e7a88", soft: "#c8eef2", bg: "#e8f4f6" },
  { accent: "#1a3d32", teal: "#22a88a", tealDeep: "#128066", soft: "#d0f0e6", bg: "#eaf6f1" },
  { accent: "#243d3c", teal: "#18a89a", tealDeep: "#0f7a70", soft: "#d4ebe8", bg: "#eef5f3" },
  { accent: "#123528", teal: "#2bb89a", tealDeep: "#149078", soft: "#d2f2ea", bg: "#e9f7f2" },
];

/** 필릭스 page.tsx 순서 (문의폼·지역아카이브 제외) */
const ORDERS: MainLandingSectionId[][] = [
  ["hero", "about", "process", "services", "gallery", "director", "reviews", "faq"],
  ["hero", "services", "gallery", "about", "process", "director", "reviews", "faq"],
  ["hero", "about", "services", "process", "gallery", "director", "reviews", "faq"],
];

const DEMOLITION_ORDERS: MainLandingSectionId[][] = [
  ["hero", "reviews", "about", "process", "gallery", "services", "director", "faq"],
  ["hero", "about", "reviews", "process", "services", "gallery", "director", "faq"],
];

const DEMOLITION_THEMES: MainLandingTheme[] = [
  { accent: "#1a2332", teal: "#e85d04", tealDeep: "#c2410c", soft: "#ffedd5", bg: "#faf7f2" },
  { accent: "#0f172a", teal: "#f97316", tealDeep: "#ea580c", soft: "#fed7aa", bg: "#fff7ed" },
  { accent: "#1e293b", teal: "#fb923c", tealDeep: "#dc2626", soft: "#ffe4e6", bg: "#f8fafc" },
  { accent: "#0c4a6e", teal: "#0284c7", tealDeep: "#0369a1", soft: "#e0f2fe", bg: "#f0f9ff" },
  { accent: "#14532d", teal: "#16a34a", tealDeep: "#15803d", soft: "#dcfce7", bg: "#f0fdf4" },
  { accent: "#312e81", teal: "#7c3aed", tealDeep: "#6d28d9", soft: "#ede9fe", bg: "#f5f3ff" },
  { accent: "#422006", teal: "#d97706", tealDeep: "#b45309", soft: "#fef3c7", bg: "#fffbeb" },
  { accent: "#134e4a", teal: "#0d9488", tealDeep: "#0f766e", soft: "#ccfbf1", bg: "#f0fdfa" },
];

const DEMOLITION_BLOCK_ORDERS: DemolitionBlockId[][] = [
  ["reviews", "about", "process", "gallery", "services", "grant", "trust", "cta", "faq"],
  ["about", "reviews", "process", "gallery", "services", "trust", "grant", "cta", "faq"],
  ["gallery", "reviews", "about", "process", "grant", "services", "trust", "faq", "cta"],
  ["reviews", "process", "about", "gallery", "grant", "cta", "trust", "services", "faq"],
  ["about", "process", "gallery", "reviews", "trust", "grant", "services", "faq", "cta"],
  ["process", "reviews", "about", "gallery", "grant", "trust", "cta", "faq"],
];

function hashSeed(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function resolveVariationSeed(config: MainLandingConfig, siteName: string) {
  const raw = String(config.variationSeed || "").trim();
  if (raw) return raw;
  return (
    [config.vendor.name, config.vendor.keyword, siteName, config.designId].filter(Boolean).join("|") || "scalp"
  );
}

export function buildMainLandingCopy(config: MainLandingConfig, siteName: string): MainLandingCopy {
  const seed = resolveVariationSeed(config, siteName);
  const rand = mulberry32(hashSeed(seed));
  const rawBase = buildMainLandingDesignBase(config, siteName);
  const base = applyCopyOverride(rawBase, config.copyOverride);
  const orderPool = config.designId === "demolition-v1" ? DEMOLITION_ORDERS : ORDERS;
  const themePool = config.designId === "demolition-v1" ? DEMOLITION_THEMES : THEMES;
  const order = orderPool[Math.floor(rand() * orderPool.length)] || orderPool[0];
  const theme = themePool[Math.floor(rand() * themePool.length)] || themePool[0];

  const processSteps = [...base.processSteps];
  if (!config.copyOverride?.processSteps && rand() > 0.65 && processSteps.length > 2) {
    const i = 1 + Math.floor(rand() * (processSteps.length - 1));
    const j = 1 + Math.floor(rand() * (processSteps.length - 1));
    [processSteps[i], processSteps[j]] = [processSteps[j], processSteps[i]];
  }
  const services = [...base.services];
  if (!config.copyOverride?.services && rand() > 0.5) services.reverse();
  const reviews = [...base.reviews];
  if (!config.copyOverride?.reviews && rand() > 0.45) {
    const i = Math.floor(rand() * reviews.length);
    const j = Math.floor(rand() * reviews.length);
    [reviews[i], reviews[j]] = [reviews[j], reviews[i]];
  }

  const extra = String(config.prompt || "").trim();
  const hasOverride = Boolean(config.copyOverride?.heroLead || config.copyOverride?.aboutBody);
  const heroLead =
    !hasOverride && extra ? `${base.heroLead} ${extra.slice(0, 140)}` : base.heroLead;
  const aboutBody =
    !hasOverride && extra && extra.length > 40
      ? `${base.aboutBody} ${extra.slice(0, 100)}`
      : base.aboutBody;

  const demolitionBlockOrder =
    config.designId === "demolition-v1"
      ? DEMOLITION_BLOCK_ORDERS[Math.floor(rand() * DEMOLITION_BLOCK_ORDERS.length)] ||
        DEMOLITION_BLOCK_ORDERS[0]
      : undefined;
  const demolitionLayoutVariant =
    config.designId === "demolition-v1" ? Math.floor(rand() * 3) : undefined;

  const merged = {
    ...base,
    heroLead,
    aboutBody,
    processSteps,
    services,
    reviews,
    theme,
    accent: theme.accent,
    sectionOrder: order,
    demolitionBlockOrder,
    demolitionLayoutVariant,
  };

  return applyPooledMainLandingCopy(merged, config, siteName, rand);
}
