import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/auth";
import { attachLocalFactBlocks } from "@/lib/article-blocks";
import { articleStyleLabel, resolveArticleStyle } from "@/lib/article-style";
import { bannedContentError, collectPublishText } from "@/lib/banned-keywords";
import { ensureCategorySlug, getCategory } from "@/lib/categories";
import { generatePipelineArticle } from "@/lib/content-pipeline";
import { getAdVendors, getCategories, getSettings, readStore } from "@/lib/db";
import { extractPlaceName } from "@/lib/region-geo";
import type { AdVendor } from "@/lib/types";

export async function POST(request: Request) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const focusKeyword = String(body.focusKeyword || "").trim();
  const topic = String(body.topic || "").trim();
  if (!focusKeyword && !topic) {
    return NextResponse.json({ error: "메인 키워드를 입력하세요." }, { status: 400 });
  }
  const keyword = focusKeyword || topic;
  const writingStyle = resolveArticleStyle(
    String(body.writingStyle || ""),
    focusKeyword,
    topic,
    String(body.keywords || "")
  );
  const cats = await getCategories();
  const category = ensureCategorySlug(body.category, cats);
  const cat = getCategory(category, cats);
  const [settings, store, vendors] = await Promise.all([getSettings(), readStore(), getAdVendors()]);
  const banned = bannedContentError(
    settings.publishBannedKeywords,
    collectPublishText({
      topic,
      focusKeyword,
      keywords: String(body.keywords || ""),
      notes: [String(body.notes || ""), String(body.experienceNotes || "")].filter(Boolean).join("\n"),
      region: String(body.region || ""),
    })
  );
  if (banned) return NextResponse.json({ error: banned }, { status: 400 });
  const region =
    String(body.region || "").trim() ||
    extractPlaceName(focusKeyword, topic, String(body.keywords || ""));
  const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json(
      { error: "제미나이 API 키가 없습니다. 설정에서 키를 저장하세요." },
      { status: 400 }
    );
  }

  const vendorId = String(body.vendorId || "").trim();
  const vendor: AdVendor | null =
    (vendorId && vendors.find((row) => row.id === vendorId)) ||
    (() => {
      const name = String(body.vendorName || "").trim();
      return name ? vendors.find((row) => row.name.trim() === name) || null : null;
    })();

  try {
    const article = await generatePipelineArticle({
      store: {
        ...store,
        settings: { ...store.settings, ...settings, geminiApiKey: apiKey },
      },
      keyword,
      category,
      categoryName: cat?.name,
      categoryNotes: [String(body.notes || "").trim(), cat?.geminiNotes || ""].filter(Boolean).join("\n\n"),
      writingStyle,
      extraPrompt: String(body.experienceNotes || ""),
      vendorName: String(body.vendorName || vendor?.name || ""),
      vendorPhone: String(body.vendorPhone || vendor?.phone || ""),
      vendorWebsite: String(body.vendorWebsite || vendor?.website || ""),
      vendorKakao: String(body.vendorKakao || vendor?.kakao || ""),
      vendorId: vendor?.id || vendorId || undefined,
      industryId: String(body.industryId || "").trim() || undefined,
      blueprintId: String(body.blueprintId || "").trim() || undefined,
      vendor,
      apiKey,
    });

    const decision = article.generationLog?.publishDecision || "";
    if (article.generationMode === "held" || decision === "HOLD" || !String(article.bodyHtml || "").trim()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            article.generationLog?.fallbackReason ||
            article.generationLog?.errors?.join("; ") ||
            "PublishGate HOLD — 초안을 자동으로 넣지 않았습니다. 업종·검증 데이터를 확인하세요.",
          publishGate: decision || "HOLD",
          generationMode: article.generationMode,
          generationLog: article.generationLog,
          industryId: article.industryId,
          blueprintId: article.blueprintId,
        },
        { status: 422 }
      );
    }

    article.bodyHtml = attachLocalFactBlocks({
      html: article.bodyHtml,
      place: region,
      keyword,
      categoryName: cat?.name,
      slug: article.slugHint,
      title: article.title,
    });
    const generatedBan = bannedContentError(
      settings.publishBannedKeywords,
      collectPublishText({
        title: article.title,
        excerpt: article.excerpt,
        bodyHtml: article.bodyHtml,
        focusKeyword: article.tags?.join(" "),
      })
    );
    if (generatedBan) {
      return NextResponse.json({ error: generatedBan }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      article,
      region,
      writingStyle,
      writingStyleLabel: articleStyleLabel(writingStyle),
      publishGate: decision || article.generationLog?.publishDecision || "PASS",
      generationMode: article.generationMode,
      generationLog: article.generationLog,
      industryId: article.industryId,
      blueprintId: article.blueprintId,
      contentAngle: article.contentAngle,
      pageType: article.pageType,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "생성에 실패했습니다.";
    const similar = /너무 비슷/.test(message);
    return NextResponse.json({ error: message }, { status: similar ? 409 : 500 });
  }
}
