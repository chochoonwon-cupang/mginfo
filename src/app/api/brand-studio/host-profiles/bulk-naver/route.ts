import { NextResponse } from "next/server";
import { checkMasterPassword } from "@/lib/auth";
import { updateStore } from "@/lib/db";
import { bulkApplyNaverToHostProfiles, type NaverMetaEntry } from "@/lib/host-profiles-bulk-naver";
import { normalizeHostKey } from "@/lib/host-profiles";
import { persistFail } from "@/lib/persist-api";
import { revalidatePublicSite } from "@/lib/public-cache";

export const dynamic = "force-dynamic";

function authorize(request: Request) {
  return checkMasterPassword(request.headers.get("x-infocs-master") || "");
}

/** Brand Studio: per-keyword naver-site-verification on hostProfiles (no redeploy). */
export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = body.entries ?? body.items;
  if (!Array.isArray(raw) || !raw.length) {
    return NextResponse.json({ error: "entries[] required (host + naverSiteVerification)" }, { status: 400 });
  }

  const entries: NaverMetaEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const host = normalizeHostKey(
      typeof r.host === "string" ? r.host : typeof r.domain === "string" ? r.domain : ""
    );
    const naverSiteVerification =
      typeof r.naverSiteVerification === "string"
        ? r.naverSiteVerification
        : typeof r.naverMeta === "string"
          ? r.naverMeta
          : "";
    if (!host || !String(naverSiteVerification || "").trim()) continue;
    entries.push({ host, naverSiteVerification });
  }
  if (!entries.length) {
    return NextResponse.json({ error: "no valid entries with host and meta" }, { status: 400 });
  }

  try {
    let result = { updated: 0, skipped: 0, notFound: [] as string[] };
    await updateStore((store) => {
      result = bulkApplyNaverToHostProfiles(store, entries);
    });
    revalidatePublicSite();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return persistFail(err);
  }
}
