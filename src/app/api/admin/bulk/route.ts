import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/auth";
import {
  bulkStats,
  defaultBulkPublish,
  normalizeBulkPublish,
  planToday,
  sanitizeGroupsInput,
  sanitizePilotInput,
  sanitizeScheduleInput,
} from "@/lib/bulk-publish";
import { countPilotPublishedToday } from "@/lib/pilot-store";
import { normalizePilotConfig } from "@/lib/pilot-config";
import { readStore, updateStore } from "@/lib/db";
import { persistFail } from "@/lib/persist-api";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const store = await readStore();
  const bulk = store.bulkPublish || defaultBulkPublish();
  const pilot = normalizePilotConfig(bulk.pilot);
  const pilotPublishedToday = pilot.enabled ? await countPilotPublishedToday() : 0;
  return NextResponse.json({
    ok: true,
    bulk,
    stats: bulkStats(bulk, store.categories || []),
    categories: store.categories || [],
    pilot,
    pilotPublishedToday,
    pilotRemaining: pilot.enabled ? Math.max(0, pilot.dailySuccessLimit - pilotPublishedToday) : null,
  });
}

export async function PUT(request: Request) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const pilotPreview = body.pilot !== undefined ? sanitizePilotInput(body.pilot) : null;
    let pilotRemaining: number | undefined;
    if (pilotPreview?.enabled || body.pilot?.enabled) {
      const published = await countPilotPublishedToday();
      const limit = normalizePilotConfig(pilotPreview || { enabled: true }).dailySuccessLimit;
      pilotRemaining = Math.max(0, limit - published);
    } else {
      // If pilot already enabled on store, still apply remaining on plan.
      const currentStore = await readStore();
      const existing = normalizePilotConfig(currentStore.bulkPublish?.pilot);
      if (existing.enabled) {
        const published = await countPilotPublishedToday();
        pilotRemaining = Math.max(0, existing.dailySuccessLimit - published);
      }
    }

    const store = await updateStore((s) => {
      const current = normalizeBulkPublish(s.bulkPublish);
      if (body.schedule !== undefined) {
        current.schedule = sanitizeScheduleInput(body.schedule, current.schedule);
        if (body.resetPlan) current.schedule.planDate = "";
      }
      if (body.groups !== undefined) {
        current.groups = sanitizeGroupsInput(body.groups, s.categories || []);
      }
      if (body.pilot !== undefined) {
        current.pilot = sanitizePilotInput(body.pilot, current.pilot);
      }
      s.bulkPublish = current;
      const pilot = normalizePilotConfig(current.pilot);
      const rem = pilot.enabled ? pilotRemaining : undefined;
      planToday(s, new Date(), { pilotRemaining: rem });
    });
    const pilot = normalizePilotConfig(store.bulkPublish.pilot);
    const pilotPublishedToday = pilot.enabled ? await countPilotPublishedToday() : 0;
    return NextResponse.json({
      ok: true,
      bulk: store.bulkPublish,
      stats: bulkStats(store.bulkPublish, store.categories || []),
      pilot,
      pilotPublishedToday,
      pilotRemaining: pilot.enabled ? Math.max(0, pilot.dailySuccessLimit - pilotPublishedToday) : null,
    });
  } catch (err) {
    return persistFail(err);
  }
}
