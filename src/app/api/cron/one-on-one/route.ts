import { NextResponse } from "next/server";
import { cronGuard } from "@/lib/cron";
import { autoGenerateOneOnOnes } from "@/lib/one-on-one";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Makes this month's 1:1 reports for everyone who does not have one yet (first week of the month, or with ?force=1). */
export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  const force = new URL(req.url).searchParams.get("force") === "1";
  return NextResponse.json({ ok: true, ...(await autoGenerateOneOnOnes(new Date(), { force, max: 10 })) });
}
