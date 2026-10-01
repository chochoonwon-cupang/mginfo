import { NextResponse } from "next/server";
import { allowCronOrAdmin, isPreviewCron } from "@/lib/cron-auth";
import { bulkStats, planToday, publishDueBulk } from "@/lib/bulk-publish";
import { readStore, updateStore } from "@/lib/db";
import { isOpsHub } from "@/lib/ops-hub";
import { HUB_TICK_WITH_BULK } from "@/lib/hub-board";
import { publishDueHubBoard } from "@/lib/hub-board-store";
import { countPilotPublishedToday, getPilotDay } from "@/lib/pilot-store";
import { normalizePilotConfig } from "@/lib/pilot-config";

export const dynamic = "force-dynamic";
/** Fewer Production crons (see vercel.json) so one tick may flush more overdue jobs. */
export const maxDuration = 300;

export async function GET(request: Request) {
  if (isPreviewCron(request)) {
    return NextResponse.json({ ok: true, skipped: true, reason: "preview" });
  }
  const allowed = await allowCronOrAdmin(request);
  if (!allowed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const beforeRead = await readStore();
  const pilot = normalizePilotConfig(beforeRead.bulkPublish?.pilot);
  let pilotRemaining: number | undefined;
  if (pilot.enabled) {
    const published = await countPilotPublishedToday();
    pilotRemaining = Math.max(0, pilot.dailySuccessLimit - published);
  }

  let planned = 0;
  const before = await updateStore((s) => {
    planned = planToday(s, new Date(), { pilotRemaining }).planned;
  });
  let hub = null as Awaited<ReturnType<typeof publishDueHubBoard>> | null;
  if (await isOpsHub()) {
    try {
      hub = await publishDueHubBoard(HUB_TICK_WITH_BULK, HUB_TICK_WITH_BULK);
    } catch {
      hub = null;
    }
  }
  if (!before.bulkPublish.schedule.enabled) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "off",
      planned: 0,
      hub,
      stats: bulkStats(before.bulkPublish, before.categories || []),
      pilot: normalizePilotConfig(before.bulkPublish.pilot),
      pilotDay: pilot.enabled ? await getPilotDay() : null,
    });
  }

  const latest = await readStore();
  const published = await publishDueBulk(latest, { mutator: updateStore });
  const store = await readStore();
  return NextResponse.json({
    ok: true,
    skipped: false,
    planned,
    ...published,
    hub,
    stats: bulkStats(store.bulkPublish, store.categories || []),
    pilot: normalizePilotConfig(store.bulkPublish.pilot),
    pilotDay: normalizePilotConfig(store.bulkPublish.pilot).enabled ? await getPilotDay() : null,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
