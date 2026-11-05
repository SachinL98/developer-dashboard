import { NextResponse } from "next/server";
import { cronGuard } from "@/lib/cron";
import * as svc from "@/lib/services";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Automated notes taker: fetches Meet transcripts for meetings that just ended and writes notes and engagement numbers. */
export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  return NextResponse.json({ ok: true, ...(await svc.processEndedMeetings({ force: true })) });
}
