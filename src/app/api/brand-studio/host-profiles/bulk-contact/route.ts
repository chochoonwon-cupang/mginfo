import { NextResponse } from "next/server";
import { checkMasterPassword } from "@/lib/auth";
import { updateStore } from "@/lib/db";
import {
  bulkApplyContactToApexHostProfiles,
  type ApexContactPatch,
} from "@/lib/host-profiles-bulk-contact";
import { apexDomain, cleanHost } from "@/lib/ops-ledger";
import { persistFail } from "@/lib/persist-api";
import { revalidatePublicSite } from "@/lib/public-cache";

export const dynamic = "force-dynamic";

function authorize(request: Request) {
  return checkMasterPassword(request.headers.get("x-infocs-master") || "");
}

function parsePatch(body: Record<string, unknown>): ApexContactPatch {
  return {
    company: typeof body.company === "string" ? body.company : undefined,
    phone: typeof body.phone === "string" ? body.phone : undefined,
    address: typeof body.address === "string" ? body.address : undefined,
    bizNo:
      typeof body.bizNo === "string"
        ? body.bizNo
        : typeof body.businessNumber === "string"
          ? body.businessNumber
          : undefined,
    ceo: typeof body.ceo === "string" ? body.ceo : undefined,
    email: typeof body.email === "string" ? body.email : undefined,
  };
}

/** Brand Studio: same apex (e.g. cheolgeopro.co.kr) keyword hostProfiles only. */
export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const apexRaw =
    typeof body.apex === "string"
      ? body.apex
      : typeof body.apexDomain === "string"
        ? body.apexDomain
        : "";
  const apex = cleanHost(apexRaw).replace(/^www\./, "") || apexDomain(apexRaw);
  if (!apex) {
    return NextResponse.json({ error: "apex or apexDomain required (e.g. cheolgeopro.co.kr)" }, { status: 400 });
  }

  const patch = parsePatch(body);
  try {
    let result = { hostsUpdated: 0, apex: apexDomain(apex) || apex };
    await updateStore((store) => {
      result = bulkApplyContactToApexHostProfiles(store, apex, patch);
    });
    revalidatePublicSite();
    return NextResponse.json({
      ok: true,
      apex: result.apex,
      hostsUpdated: result.hostsUpdated,
    });
  } catch (err) {
    return persistFail(err);
  }
}
