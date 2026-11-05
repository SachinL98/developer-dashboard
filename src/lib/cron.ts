import { NextResponse } from "next/server";
import { safeEqual } from "./crypto";

/** Bearer-token guard for scheduled endpoints. Refuses everything when CRON_SECRET is unset. */
export function cronGuard(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return safeEqual(got, secret) ? null : NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
