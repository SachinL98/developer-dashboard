import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import * as svc from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * Background Jira poll. This is a plain GET route on purpose: Next.js runs server actions one at a time per browser, so a slow
 * Jira call made as an action would make the user's next click wait behind it.
 */
export async function GET() {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });
  try {
    const r = await svc.liveSync();
    return NextResponse.json({ ok: true, changed: r.changed, lastSync: r.lastSync }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 160) : "Sync failed" });
  }
}
