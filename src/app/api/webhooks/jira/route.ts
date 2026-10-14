import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { statusFromJira } from "@/lib/integrations/jira";
import { canMove, type StatusKey } from "@/lib/workflow";

export const dynamic = "force-dynamic";

/** Jira `jira:issue_updated` webhook: mirror forward-only status changes made in Jira. */
export async function POST(req: Request) {
  const secret = process.env.JIRA_WEBHOOK_SECRET;
  if (secret && new URL(req.url).searchParams.get("secret") !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const key: string | undefined = body.issue?.key;
  const statusName: string | undefined = body.issue?.fields?.status?.name;
  if (!key || !statusName) return NextResponse.json({ ok: true, ignored: true });
  const to = statusFromJira(statusName);
  const t = await db.ticket.findUnique({ where: { key } });
  if (!t || !to || t.status === to) return NextResponse.json({ ok: true, ignored: true });
  if (!canMove(t.status as StatusKey, to)) return NextResponse.json({ ok: true, rejected: `${t.status} → ${to} is not a legal forward move` });
  await db.$transaction([
    db.ticket.update({ where: { id: t.id }, data: { status: to, ...(to === "IN_PROGRESS" && !t.startedAt ? { startedAt: new Date() } : {}), ...(to === "DEPLOYED_PROD" ? { doneAt: new Date() } : {}) } }),
    db.transition.create({ data: { ticketId: t.id, from: t.status, to } }),
  ]);
  return NextResponse.json({ ok: true, moved: to });
}
