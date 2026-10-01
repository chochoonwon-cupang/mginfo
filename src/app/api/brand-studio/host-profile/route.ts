import { NextResponse } from "next/server";
import { checkMasterPassword } from "@/lib/auth";
import { readStore } from "@/lib/db";
import {
  getHostProfile,
  isKeywordSubdomainHost,
  normalizeHostKey,
  resolveHostProfile,
  upsertKeywordHostProfile,
} from "@/lib/host-profiles";
import { mainLandingEnabled } from "@/lib/main-landing";
import { updateStore } from "@/lib/db";
import { revalidatePublicSite } from "@/lib/public-cache";
import type { HostSiteProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Brand Studio: verify per-host main landing after bootstrap. */
export async function GET(request: Request) {
  const secret = request.headers.get("x-infocs-master") || "";
  if (!checkMasterPassword(secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const host = normalizeHostKey(url.searchParams.get("host") || "");
  if (!host) {
    return NextResponse.json({ error: "host required" }, { status: 400 });
  }
  const store = await readStore();
  const profile = resolveHostProfile(store, host) ?? getHostProfile(store, host);
  if (!profile) {
    return NextResponse.json({ ok: false, host, found: false }, { status: 404 });
  }
  const enabled = mainLandingEnabled({ mainLanding: profile.mainLanding });
  const keyword = String(profile.mainLanding?.vendor?.keyword || profile.siteName || "").trim();
  const designId = String(profile.mainLanding?.designId || "").trim();
  return NextResponse.json({
    ok: enabled,
    host,
    found: true,
    enabled,
    keyword,
    designId,
  });
}

/** Master upsert — keyword subdomain main landing (when admin/bootstrap blob write fails). */
export async function PUT(request: Request) {
  const secret = request.headers.get("x-infocs-master") || "";
  if (!checkMasterPassword(secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const host = normalizeHostKey(
    typeof body.host === "string" ? body.host : typeof body.domain === "string" ? body.domain : ""
  );
  if (!host || !isKeywordSubdomainHost(host)) {
    return NextResponse.json({ error: "keyword subdomain host required" }, { status: 400 });
  }
  if (body.mainLanding === undefined) {
    return NextResponse.json({ error: "mainLanding required" }, { status: 400 });
  }
  const saved: { profile: HostSiteProfile | null } = { profile: null };
  await updateStore((s) => {
    saved.profile = upsertKeywordHostProfile(s, host, body);
  });
  revalidatePublicSite();
  const profile = saved.profile;
  const ml = profile?.mainLanding;
  return NextResponse.json({
    ok: Boolean(profile),
    host,
    found: Boolean(profile),
    enabled: mainLandingEnabled({ mainLanding: ml }),
    keyword: String(ml?.vendor?.keyword || profile?.siteName || "").trim(),
    designId: String(ml?.designId || "").trim(),
  });
}

/** Remove per-host profile so Studio can re-publish cleanly. */
export async function DELETE(request: Request) {
  const secret = request.headers.get("x-infocs-master") || "";
  if (!checkMasterPassword(secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const host = normalizeHostKey(url.searchParams.get("host") || "");
  if (!host) {
    return NextResponse.json({ error: "host required" }, { status: 400 });
  }
  let removed: string[] = [];
  await updateStore((s) => {
    if (!s.hostProfiles) return;
    const keys = Object.keys(s.hostProfiles);
    for (const key of keys) {
      const norm = normalizeHostKey(key);
      if (norm === host || key === host) {
        delete s.hostProfiles[key];
        removed.push(key);
      }
    }
  });
  revalidatePublicSite();
  return NextResponse.json({ ok: true, host, removed });
}
