import { NextResponse } from "next/server";
import { checkMasterPassword } from "@/lib/auth";
import { parseAdVendorSnapshots, upsertAdVendors } from "@/lib/ad-vendors";
import { bannedContentError, unpublishBannedPosts } from "@/lib/banned-keywords";
import { FREE_BOARD_SLUG, withFreeBoard } from "@/lib/categories";
import { getSettings, updateStore } from "@/lib/db";
import { alreadyHasCampaign, makeBoardPost } from "@/lib/hub-board";
import { notifyPostIndexed } from "@/lib/indexnow";
import { persistFail } from "@/lib/persist-api";
import { revalidatePublicSite } from "@/lib/public-cache";
import { applyMasterSettingsPatch, publicMasterSettings } from "@/lib/settings-apply";
import { isSiteThemeId } from "@/lib/site-theme";
import { isWritingToneId } from "@/lib/writing-tone";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const header = request.headers.get("x-infocs-master") || "";
  if (!checkMasterPassword(header)) {
    return NextResponse.json({ error: "마스터만 볼 수 있습니다." }, { status: 401 });
  }
  const settings = await getSettings();
  return NextResponse.json(publicMasterSettings(settings));
}

export async function PATCH(request: Request) {
  const header = request.headers.get("x-infocs-master") || "";
  if (!checkMasterPassword(header)) {
    return NextResponse.json({ error: "마스터만 저장할 수 있습니다." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const writingTone = isWritingToneId(body.writingTone) ? body.writingTone : "";
  const siteTheme = isSiteThemeId(body.siteTheme) ? body.siteTheme : "";
  const unpublishBanned = body.unpublishBanned === true || body.unpublishBanned === "true";
  try {
    let unpublished = 0;
    let next = publicMasterSettings(await getSettings());
    await updateStore((store) => {
      if (writingTone) store.settings.writingTone = writingTone;
      if (siteTheme) store.settings.siteTheme = siteTheme;
      applyMasterSettingsPatch(store, body);
      if (unpublishBanned) {
        unpublished = unpublishBannedPosts(store.posts, store.settings.publishBannedKeywords);
      }
      next = publicMasterSettings(store.settings);
    });
    revalidatePublicSite();
    return NextResponse.json({ ok: true, unpublished, ...next });
  } catch (err) {
    if (err instanceof Error && /아이디|비밀번호/.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return persistFail(err);
  }
}

export async function POST(request: Request) {
  const header = request.headers.get("x-infocs-master") || "";
  if (!checkMasterPassword(header)) {
    return NextResponse.json({ error: "마스터만 등록할 수 있습니다." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "제목을 입력하세요." }, { status: 400 });
  const hubCampaignId = String(body.hubCampaignId || "").trim();

  try {
    let post = null as ReturnType<typeof makeBoardPost> | null;
    let duplicate = false;
    await updateStore((store) => {
      const banned = bannedContentError(store.settings.publishBannedKeywords, title, String(body.focusKeyword || ""), String(body.excerpt || ""), String(body.bodyHtml || ""));
      if (banned) throw new Error(banned);
      store.categories = withFreeBoard(store.categories);
      const hubVendors = parseAdVendorSnapshots(body.adVendors ?? body.adVendor);
      if (hubVendors.length) {
        store.adVendors = upsertAdVendors(store.adVendors || [], hubVendors);
      }
      if (hubCampaignId && alreadyHasCampaign(store.posts, hubCampaignId)) {
        duplicate = true;
        post = store.posts.find((row) => row.hubCampaignId === hubCampaignId) || null;
        return;
      }
      post = makeBoardPost({ ...body, category: FREE_BOARD_SLUG }, store.posts);
      store.posts.unshift(post);
    });
    if (!post) return NextResponse.json({ error: "글을 만들지 못했습니다." }, { status: 500 });
    if (!duplicate) {
      await notifyPostIndexed(post.slug);
      revalidatePublicSite();
    }
    return NextResponse.json({ ok: true, duplicate, post });
  } catch (err) {
    if (err instanceof Error && err.message.includes("발행금지")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return persistFail(err);
  }
}
