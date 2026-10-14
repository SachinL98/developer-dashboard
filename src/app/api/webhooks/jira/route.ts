import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { parseIssue, jiraReady } from "@/lib/integrations/jira";
import { runAs } from "@/lib/context";
import { serviceUserId } from "@/lib/integrations/connections";
import { db } from "@/lib/db";
import * as svc from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * Jira webhook (realtime). Register one webhook for Issue created/updated/deleted, Sprint created/started/closed/updated and
 * Board configuration changed. Issue events are mirrored straight into the local ticket (status, fields, assignee, sprint, estimate);
 * sprint and board events refresh sprints and the real board columns using a connected lead/admin (or the service account).
 */
export async function POST(req: Request) {
  const secret = process.env.JIRA_WEBHOOK_SECRET;
  if (!secret && process.env.NODE_ENV === "production") return NextResponse.json({ error: "JIRA_WEBHOOK_SECRET is not configured" }, { status: 503 });
  if (secret && !safeEqual(new URL(req.url).searchParams.get("secret") ?? "", secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  const event: string = body.webhookEvent ?? "";

  if (event === "jira:issue_deleted") {
    const key: string | undefined = body.issue?.key;
    if (key) await db.ticket.updateMany({ where: { key }, data: { jiraKey: null, jiraStatus: null } });
    return NextResponse.json({ ok: true, unlinked: key ?? null });
  }
  if (body.issue?.key && body.issue?.fields) {
    const project = process.env.JIRA_PROJECT_KEY;
    if (project && !String(body.issue.key).startsWith(project + "-")) return NextResponse.json({ ok: true, ignored: "other project" });
    const result = await svc.applyJiraIssue(parseIssue(body.issue));
    return NextResponse.json({ ok: true, issue: body.issue.key, result });
  }
  if (event.startsWith("sprint_") || event.startsWith("board_")) {
    const out = await runAs(await serviceUserId("JIRA"), async () => {
      if (!(await jiraReady())) return "skipped: no connected lead/admin and no service account";
      if (event.startsWith("sprint_")) await svc.syncSprintsFromJira();
      else await svc.syncBoard();
      return "refreshed";
    });
    return NextResponse.json({ ok: true, event, out });
  }
  return NextResponse.json({ ok: true, ignored: event || "unknown" });
}
