import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/auth";
import { getPostById, getCategories, getSettings, updateStore } from "@/lib/db";
import { extraImageLimit, parsePostImages } from "@/lib/post-images";
import { checkCanPublish } from "@/lib/publish-limits";
import { bannedContentError, collectPublishText } from "@/lib/banned-keywords";
import { ensureCategorySlug } from "@/lib/categories";
import { notifyPostIndexed } from "@/lib/indexnow";
import { persistFail } from "@/lib/persist-api";
import { cleanHtml } from "@/lib/sanitize";
import { slugify } from "@/lib/slug";
import { parseFaqItems } from "@/lib/faq";
import { extractPlaceName, parseNameList } from "@/lib/region-geo";
import { parseVendorFields } from "@/lib/vendor";
import { ensureVendorSlots } from "@/lib/vendor-slots";
import type { PostStatus, PublishMode } from "@/lib/types";

function parsePublishMode(raw: unknown, fallback?: PublishMode): PublishMode | undefined {
  const value = String(raw || "").trim();
  if (value === "direct" || value === "ai") return value;
  return fallback;
}

function prepareBodyHtml(html: string, mode?: PublishMode) {
  const cleaned = cleanHtml(html);
  if (mode === "direct") return cleaned;
  return cleanHtml(ensureVendorSlots(cleaned));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const current = await getPostById(id);
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const now = new Date().toISOString();
  const status: PostStatus = body.status === "published" ? "published" : body.status === "draft" ? "draft" : current.status;
  const settings = await getSettings();
  if (status === "published") {
    const publishBlock = checkCanPublish(settings, current.status === "published");
    if (publishBlock) return NextResponse.json({ error: publishBlock }, { status: 403 });
    const banned = bannedContentError(
      settings.publishBannedKeywords,
      collectPublishText({
        title: String(body.title ?? current.title),
        excerpt: String(body.excerpt ?? current.excerpt ?? ""),
        bodyHtml: String(body.bodyHtml ?? current.bodyHtml ?? ""),
        focusKeyword: String(body.focusKeyword ?? current.focusKeyword ?? ""),
        tags: Array.isArray(body.tags)
          ? body.tags.map((t: string) => String(t))
          : body.tags != null
            ? String(body.tags).split(",")
            : current.tags,
        region: String(body.region ?? current.region ?? ""),
      })
    );
    if (banned) return NextResponse.json({ error: banned }, { status: 400 });
  }
  const cats = await getCategories();
  const category = ensureCategorySlug(body.category, cats, current.category);

  let slug = body.slug ? slugify(String(body.slug)) : current.slug;
  try {
    await updateStore((s) => {
      if (s.posts.some((p) => p.slug === slug && p.id !== id)) {
        slug = `${slug}-${Date.now().toString(36)}`;
      }
      const idx = s.posts.findIndex((p) => p.id === id);
      if (idx < 0) return;
      const wasPublished = s.posts[idx].status === "published";
      const publishMode =
        body.publishMode !== undefined
          ? parsePublishMode(body.publishMode, s.posts[idx].publishMode)
          : s.posts[idx].publishMode;
      s.posts[idx] = {
        ...s.posts[idx],
        title: String(body.title ?? s.posts[idx].title).trim() || s.posts[idx].title,
        slug,
        excerpt: body.excerpt != null ? String(body.excerpt) : s.posts[idx].excerpt,
        bodyHtml:
          body.bodyHtml != null
            ? prepareBodyHtml(String(body.bodyHtml), publishMode)
            : s.posts[idx].bodyHtml,
        category,
        tags: Array.isArray(body.tags)
          ? body.tags.map((t: string) => String(t)).filter(Boolean)
          : body.tags != null
            ? String(body.tags)
                .split(",")
                .map((t: string) => t.trim())
                .filter(Boolean)
            : s.posts[idx].tags,
        coverImage: body.coverImage != null ? String(body.coverImage) || undefined : s.posts[idx].coverImage,
        coverCaption:
          body.coverCaption !== undefined
            ? String(body.coverCaption || "").trim() || undefined
            : s.posts[idx].coverCaption,
        extraImages:
          body.extraImages !== undefined
            ? parsePostImages(body.extraImages, extraImageLimit(true))
            : s.posts[idx].extraImages,
        focusKeyword:
          body.focusKeyword != null
            ? String(body.focusKeyword).trim() || undefined
            : s.posts[idx].focusKeyword,
        faqItems: body.faqItems !== undefined ? parseFaqItems(body.faqItems) : s.posts[idx].faqItems,
        regionInfo:
          body.regionInfo !== undefined ? String(body.regionInfo || "").trim() || undefined : s.posts[idx].regionInfo,
        nearbyAreas: body.nearbyAreas !== undefined ? parseNameList(body.nearbyAreas) : s.posts[idx].nearbyAreas,
        nearbyStations:
          body.nearbyStations !== undefined ? parseNameList(body.nearbyStations) : s.posts[idx].nearbyStations,
        status,
        publishedAt:
          status === "published"
            ? wasPublished
              ? s.posts[idx].publishedAt
              : now
            : s.posts[idx].publishedAt,
        updatedAt: now,
        publishMode,
        theme: body.theme != null ? String(body.theme) : s.posts[idx].theme,
        ...parseVendorFields(body),
        region:
          String(body.region ?? s.posts[idx].region ?? "").trim() ||
          extractPlaceName(
            String(body.title ?? s.posts[idx].title),
            String(body.focusKeyword ?? s.posts[idx].focusKeyword ?? "")
          ) ||
          undefined,
      };
    });
  } catch (err) {
    return persistFail(err);
  }
  const saved = await getPostById(id);
  let indexNow: { ok: boolean; detail?: string } = { ok: false, detail: "초안" };
  if (saved?.status === "published") {
    indexNow = await notifyPostIndexed(saved.slug);
  }
  return NextResponse.json({ ok: true, post: saved, indexNow });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  try {
    await updateStore((s) => {
      s.posts = s.posts.filter((p) => p.id !== id);
    });
  } catch (err) {
    return persistFail(err);
  }
  return NextResponse.json({ ok: true });
}
