import { NextResponse } from "next/server";
import { cronGuard } from "@/lib/cron";
import { runAs } from "@/lib/context";
import { serviceUserId } from "@/lib/integrations/connections";
import { jiraReady } from "@/lib/integrations/jira";
import { githubConfigured } from "@/lib/integrations/github";
import * as svc from "@/lib/services";
import { pruneSessions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Scheduled two-way sync: pulls Jira sprints/issues (as a connected lead/admin), links GitHub PRs, makes sure the meeting cadence exists. */
export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  const out: Record<string, unknown> = {};
  await pruneSessions();
  const jiraUser = await serviceUserId("JIRA");
  await runAs(jiraUser, async () => {
    if (!(await jiraReady())) { out.jira = "skipped: no connected lead/admin and no service account"; return; }
    try { out.jiraSprints = await svc.syncSprintsFromJira(); out.jira = await svc.syncJira(); } catch (e) { out.jira = `error: ${e instanceof Error ? e.message : e}`; }
  });
  if (githubConfigured()) { try { out.github = await svc.syncGithub(); } catch (e) { out.github = `error: ${e instanceof Error ? e.message : e}`; } }
  await runAs(await serviceUserId("GOOGLE"), async () => {
    try { out.meetings = await svc.syncMeetingCadence(14); } catch (e) { out.meetings = `error: ${e instanceof Error ? e.message : e}`; }
  });
  return NextResponse.json({ ok: true, ...out });
}
