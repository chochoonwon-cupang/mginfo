import { discoverWebFolderImages } from "../web-image-folder";
import { defaultDemolitionImageUrls, DEFAULT_DEMOLITION_IMAGE_FOLDER } from "./demolition-images";
import type { MainLandingConfig, MainLandingResolvedImages } from "./types";
import { resolveVariationSeed } from "./vary";

const IMAGE_URL_RE = /\.(webp|jpe?g|png|gif|avif)(?:\?|#|$)/i;

/** 폴더 주소·빈 값·비이미지 URL은 슬롯으로 쓰지 않는다. */
export function isMainLandingImageUrl(raw: string | undefined | null) {
  const url = String(raw || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) return false;
  if (/\/$/.test(url)) return false;
  return IMAGE_URL_RE.test(url);
}

function slotUrl(raw: string | undefined) {
  const url = String(raw || "").trim();
  return isMainLandingImageUrl(url) ? url : "";
}

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

function shuffle<T>(items: T[], rand: () => number) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function pick(pool: string[], used: Set<string>, rand: () => number, fallback = "") {
  const free = pool.filter((url) => url && !used.has(url));
  if (free.length) {
    const url = free[Math.floor(rand() * free.length)] || fallback;
    if (url) used.add(url);
    return url;
  }
  // 갤러리 중복 방지: 여분이 없으면 비우고 fallback만 허용
  return fallback;
}

export async function resolveMainLandingImages(
  config: MainLandingConfig,
  siteName: string
): Promise<MainLandingResolvedImages> {
  const slots = config.slots || {};
  let pool: string[] = [];
  const folder =
    String(config.imageFolderUrl || "").trim() ||
    (config.designId === "demolition-v1" ? DEFAULT_DEMOLITION_IMAGE_FOLDER : "");
  if (folder) {
    try {
      const found = await discoverWebFolderImages(folder);
      pool = (found.urls || []).filter(isMainLandingImageUrl);
    } catch {
      pool = [];
    }
  }
  if (!pool.length && config.designId === "demolition-v1") {
    pool = defaultDemolitionImageUrls();
  }
  const seed = resolveVariationSeed(config, siteName);
  const rand = mulberry32(hashSeed(`img|${seed}`));
  const shuffled = shuffle(pool, rand);
  const used = new Set<string>();

  const takeSlot = (raw: string | undefined) => {
    const url = slotUrl(raw);
    if (url) used.add(url);
    return url;
  };

  const hero = takeSlot(slots.hero) || pick(shuffled, used, rand);
  const about = takeSlot(slots.about) || pick(shuffled, used, rand, hero);
  const gallerySeed = [
    takeSlot(slots.gallery1) || pick(shuffled, used, rand),
    takeSlot(slots.gallery2) || pick(shuffled, used, rand),
    takeSlot(slots.gallery3) || pick(shuffled, used, rand),
  ].filter(Boolean);
  // 필릭스형 그리드용 추가 컷 (슬롯 외 폴더에서)
  while (gallerySeed.length < 14) {
    const extra = pick(shuffled, used, rand);
    if (!extra) break;
    gallerySeed.push(extra);
  }
  const uniqueGallery = [...new Set(gallerySeed)];
  const contact = takeSlot(slots.contact) || pick(shuffled, used, rand, hero);

  return { hero, about, gallery: uniqueGallery, contact };
}
