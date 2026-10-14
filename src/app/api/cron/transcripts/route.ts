import { NextResponse } from "next/server";
import { cronGuard } from "@/lib/cron";
import { db } from "@/lib/db";
import { runAs } from "@/lib/context";
import { serviceUserId } from "@/lib/integrations/connections";
import { googleReady } from "@/lib/integrations/google";
import * as svc from "@/lib/services";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Automated notes taker: for meetings that ended 10 min to 3 days ago and have no notes, fetch the Meet transcript and generate notes. */
export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  const now = Date.now();
  const pending = await db.meeting.findMany({
    where: { transcript: null, meetUrl: { not: null }, endsAt: { lt: new Date(now - 10 * 60_000), gt: new Date(now - 3 * 864e5) } },
    orderBy: { endsAt: "desc" }, take: 20,
  });
  const results: Record<string, string> = {};
  await runAs(await serviceUserId("GOOGLE"), async () => {
    if (!(await googleReady())) { results.all = "skipped: no Google connection"; return; }
    for (const m of pending) {
      try { const r = await svc.importMeetTranscript(m.id); results[m.title + " " + m.startsAt.toISOString().slice(0, 16)] = r ? `notes from ${r.chars} chars` : "no transcript yet"; }
      catch (e) { results[m.id] = `error: ${e instanceof Error ? e.message.slice(0, 120) : e}`; }
    }
  });
  return NextResponse.json({ ok: true, checked: pending.length, results });
}
