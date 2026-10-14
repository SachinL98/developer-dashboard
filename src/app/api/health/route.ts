import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { integrationStatus } from "@/lib/integrations/status";
export const dynamic = "force-dynamic";
export async function GET() {
  try { await db.$queryRaw`SELECT 1`; return NextResponse.json({ ok: true, db: "up", integrations: integrationStatus().map((i) => ({ id: i.id, configured: i.configured })) }); }
  catch { return NextResponse.json({ ok: false, db: "down" }, { status: 503 }); }
}
