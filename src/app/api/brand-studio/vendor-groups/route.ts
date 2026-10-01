import { NextResponse } from "next/server";
import { checkMasterPassword } from "@/lib/auth";
import { updateStore } from "@/lib/db";
import { refreshHostProfilesVendorGroups } from "@/lib/host-vendor-sync";
import { normalizeVendorGroups } from "@/lib/vendor-groups";
import { persistFail } from "@/lib/persist-api";
import { revalidatePublicSite } from "@/lib/public-cache";

export const dynamic = "force-dynamic";

function authorize(request: Request) {
  return checkMasterPassword(request.headers.get("x-infocs-master") || "");
}

/** Save region→vendor groups and optionally refresh all host profiles. */
export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const groups = normalizeVendorGroups(body.vendorGroups ?? body.groups);
  const apply = body.apply !== false;
  try {
    let updated = 0;
    await updateStore((s) => {
      s.vendorGroups = groups;
      if (apply) updated = refreshHostProfilesVendorGroups(s, groups);
    });
    revalidatePublicSite();
    return NextResponse.json({ ok: true, count: groups.length, hostsUpdated: updated });
  } catch (err) {
    return persistFail(err);
  }
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { readStore } = await import("@/lib/db");
  const store = await readStore();
  return NextResponse.json({ vendorGroups: normalizeVendorGroups(store.vendorGroups) });
}
