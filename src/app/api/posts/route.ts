import { NextResponse } from "next/server";
import { ensureCategorySlug } from "@/lib/categories";
import { isAdminSession } from "@/lib/auth";
import { getPublishedPosts, readStore, updateStore } from "@/lib/db";
import { bannedContentError, collectPublishText } from "@/lib/banned-keywords";
import { checkCanCreatePost, checkCanPublish } from "@/lib/publish-limits";
import { notifyPostIndexed } from "@/lib/indexnow";
import { persistFail } from "@/lib/persist-api";
import { cleanHtml } from "@/lib/sanitize";
import { slugify, uid } from "@/lib/slug";
import { parseFaqItems } from "@/lib/faq";
import { extraImageLimit, parsePostImages } from "@/lib/post-images";
import { extractPlaceName, parseNameList } from "@/lib/region-geo";
import { parseVendorFields } from "@/lib/vendor";
import { ensureVendorSlots } from "@/lib/vendor-slots";
import type { PostStatus, PublishMode } from "@/lib/types";

function parsePublishMode(raw: unknown): PublishMode | undefined {
  const value = String(raw || "").trim();
  if (value === "direct" || value === "ai") return value;
  return undefined;
}

function prepareBodyHtml(html: string, mode?: PublishMode) {
  const cleaned = cleanHtml(html);
  if (mode === "direct") return cleaned;
  return cleanHtml(ensureVendorSlots(cleaned));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const admin = await isAdminSession();
  if (admin && searchParams.get("all") === "1") {
    return NextResponse.json({ posts: (await readStore()).posts });
  }
  return NextResponse.json({ posts: await getPublishedPosts() });
}

export async function POST(request: Request) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "제목을 입력하세요." }, { status: 400 });

  const status: PostStatus = body.status === "published" ? "published" : "draft";
  let slug = slugify(String(body.slug || title));
  const store = await readStore();
  const createBlock = checkCanCreatePost(store.settings, store.posts);
  if (createBlock) return NextResponse.json({ error: createBlock }, { status: 403 });
  if (status === "published") {
    const publishBlock = checkCanPublish(store.settings);
    if (publishBlock) return NextResponse.json({ error: publishBlock }, { status: 403 });
    const banned = bannedContentError(
      store.settings.publishBannedKeywords,
      collectPublishText({
        title,
        excerpt: String(body.excerpt || ""),
        bodyHtml: String(body.bodyHtml || ""),
        focusKeyword: String(body.focusKeyword || ""),
        tags: Array.isArray(body.tags) ? body.tags.map((t: string) => String(t)) : String(body.tags || "").split(","),
        topic: String(body.topic || ""),
        region: String(body.region || ""),
      })
    );
    if (banned) return NextResponse.json({ error: banned }, { status: 400 });
  }
  const category = ensureCategorySlug(body.category, store.categories || []);
  if (store.posts.some((p) => p.slug === slug)) slug = `${slug}-${Date.now().toString(36)}`;

  const publishMode = parsePublishMode(body.publishMode);
  const now = new Date().toISOString();
  const post = {
    id: uid(),
    slug,
    title,
    excerpt: String(body.excerpt || ""),
    bodyHtml: prepareBodyHtml(String(body.bodyHtml || ""), publishMode),
    category,
    tags: Array.isArray(body.tags)
      ? body.tags.map((t: string) => String(t)).filter(Boolean)
      : String(body.tags || "")
          .split(",")
          .map((t: string) => t.trim())
          .filter(Boolean),
    coverImage: String(body.coverImage || "") || undefined,
    coverCaption: String(body.coverCaption || "").trim() || undefined,
    extraImages: parsePostImages(body.extraImages, extraImageLimit(true)),
    focusKeyword: String(body.focusKeyword || "").trim() || undefined,
    faqItems: parseFaqItems(body.faqItems),
    regionInfo: String(body.regionInfo || "").trim() || undefined,
    nearbyAreas: parseNameList(body.nearbyAreas),
    nearbyStations: parseNameList(body.nearbyStations),
    status,
    publishedAt: status === "published" ? now : null,
    createdAt: now,
    updatedAt: now,
    publishMode,
    theme: String(body.theme || "art-v1"),
    ...parseVendorFields(body),
    region:
      String(body.region || "").trim() ||
      extractPlaceName(title, String(body.focusKeyword || "")) ||
      undefined,
  };

  try {
    await updateStore((s) => {
      s.posts.unshift(post);
    });
  } catch (err) {
    return persistFail(err);
  }
  let indexNow: { ok: boolean; detail?: string } = { ok: false, detail: "초안" };
  if (status === "published") {
    indexNow = await notifyPostIndexed(post.slug);
  }
  return NextResponse.json({ ok: true, post, indexNow });
}
