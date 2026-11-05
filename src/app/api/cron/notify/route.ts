import { NextResponse } from "next/server";
import { cronGuard } from "@/lib/cron";
import { runNotifications } from "@/lib/notify/run";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Overdue-ticket alerts and start-of-day reminders. Run it every 10 minutes; each person gets at most one of each per day. */
export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  return NextResponse.json({ ok: true, ...(await runNotifications(new Date(), { force: new URL(req.url).searchParams.get("force") === "1" })) });
}
