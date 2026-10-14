"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as svc from "@/lib/services";
import * as jira from "@/lib/integrations/jira";
import * as gcal from "@/lib/integrations/google";
import { MEETING_DEFS, occurrences } from "@/lib/schedule";
import { parseNotes, summariseWithClaude } from "@/lib/notes";
import { currentDeveloper } from "@/lib/session";
import { fillSprint, sprintFit } from "@/lib/estimation";
import type { StatusKey } from "@/lib/workflow";
import type { ReviewItem } from "@/lib/review-template";

type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const touch = () => { for (const p of ["/", "/board", "/sprints", "/time", "/estimation", "/meetings", "/analytics", "/tickets"]) revalidatePath(p); };

export async function selectDeveloper(id: string) {
  (await cookies()).set("dev", id, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  touch();
}

// ----- tickets -----
export async function createTicketAction(input: svc.NewTicket): Promise<Result<{ key: string; jiraError: string | null }>> {
  try {
    if (!input.title?.trim()) return { ok: false, error: "Title is required" };
    const { ticket, jiraError } = await svc.createTicket({ ...input, title: input.title.trim() });
    touch();
    return { ok: true, key: ticket.key, jiraError };
  } catch (e) { return fail(e); }
}

export async function moveTicketAction(ticketId: string, to: StatusKey): Promise<Result<{ label: string; syncError: string | null }>> {
  try {
    const me = await currentDeveloper();
    const r = await svc.moveTicket(ticketId, to, me?.id);
    touch(); revalidatePath(`/tickets/${ticketId}`);
    return r.ok ? { ok: true, label: r.label, syncError: r.syncError } : { ok: false, error: r.error };
  } catch (e) { return fail(e); }
}

export async function updateTicketAction(id: string, patch: { assigneeId?: string | null; storyPoints?: number | null; estimateHrs?: number | null; prUrl?: string | null; complicated?: boolean; priority?: any; title?: string; description?: string }): Promise<Result> {
  try {
    const t = await db.ticket.update({ where: { id }, data: { ...patch, ...(patch.prUrl ? { prNumber: Number(patch.prUrl.match(/pull\/(\d+)/)?.[1]) || null, prState: "open" } : {}) } });
    if (t.jiraKey && jira.jiraConfigured() && (patch.storyPoints != null || patch.estimateHrs != null))
      await jira.updateEstimate(t.jiraKey, { points: patch.storyPoints, hours: patch.estimateHrs }).catch(() => {});
    touch(); revalidatePath(`/tickets/${id}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function setProgressAction(id: string, pct: number, note?: string): Promise<Result> {
  try { await svc.setProgress(id, pct, note); touch(); revalidatePath(`/tickets/${id}`); return { ok: true }; } catch (e) { return fail(e); }
}

// ----- time -----
export async function clockInAction(): Promise<Result> { try { const me = await currentDeveloper(); if (me) await svc.clockIn(me.id); touch(); return { ok: true }; } catch (e) { return fail(e); } }
export async function clockOutAction(): Promise<Result> { try { const me = await currentDeveloper(); if (me) await svc.clockOut(me.id); touch(); return { ok: true }; } catch (e) { return fail(e); } }
export async function startTimerAction(ticketId: string): Promise<Result> { try { const me = await currentDeveloper(); if (me) await svc.startTimer(ticketId, me.id); touch(); revalidatePath(`/tickets/${ticketId}`); return { ok: true }; } catch (e) { return fail(e); } }
export async function stopTimerAction(): Promise<Result> { try { const me = await currentDeveloper(); if (me) await svc.stopTimer(me.id); touch(); return { ok: true }; } catch (e) { return fail(e); } }

// ----- reviews -----
export async function runReviewAction(ticketId: string): Promise<Result<{ source: string }>> {
  try { const r = await svc.runInitialReview(ticketId); revalidatePath(`/tickets/${ticketId}`); return { ok: true, source: r.source }; } catch (e) { return fail(e); }
}
export async function saveReviewAction(reviewId: string, ticketId: string, items: ReviewItem[]): Promise<Result<{ passed: boolean }>> {
  try { const r = await svc.saveReview(reviewId, items); revalidatePath(`/tickets/${ticketId}`); return { ok: true, passed: r.passed }; } catch (e) { return fail(e); }
}
export async function startReviewerPassAction(ticketId: string): Promise<Result> {
  try {
    const { freshChecklist } = await import("@/lib/review-template");
    const n = await db.prReview.count({ where: { ticketId, kind: "REVIEWER" } });
    await db.prReview.create({ data: { ticketId, kind: "REVIEWER", round: n + 1, items: freshChecklist() as any } });
    revalidatePath(`/tickets/${ticketId}`); return { ok: true };
  } catch (e) { return fail(e); }
}

// ----- estimation -----
export async function voteAction(ticketId: string, hours: number): Promise<Result> {
  try {
    const me = await currentDeveloper(); if (!me) return { ok: false, error: "No developer selected" };
    await db.estimateVote.upsert({ where: { ticketId_developerId: { ticketId, developerId: me.id } }, update: { hours }, create: { ticketId, developerId: me.id, hours } });
    revalidatePath("/estimation"); return { ok: true };
  } catch (e) { return fail(e); }
}
export async function clearVotesAction(ticketId: string): Promise<Result> { try { await db.estimateVote.deleteMany({ where: { ticketId } }); revalidatePath("/estimation"); return { ok: true }; } catch (e) { return fail(e); } }
export async function applyEstimateAction(ticketId: string, hours: number, points: number | null): Promise<Result> {
  try { return await updateTicketAction(ticketId, { estimateHrs: hours, storyPoints: points }); } catch (e) { return fail(e); }
}

// ----- sprints -----
export async function createSprintAction(input: { name: string; goal?: string; start: string; end: string }): Promise<Result<{ id: string }>> {
  try {
    let jiraId: string | null = null;
    if (jira.jiraConfigured() && process.env.JIRA_BOARD_ID) jiraId = await jira.createSprint(input.name, new Date(input.start), new Date(input.end), input.goal).catch(() => null);
    const s = await db.sprint.create({ data: { name: input.name, goal: input.goal, startDate: new Date(input.start), endDate: new Date(input.end), jiraId } });
    touch(); return { ok: true, id: s.id };
  } catch (e) { return fail(e); }
}

export async function assignToSprintAction(ticketId: string, sprintId: string | null): Promise<Result> {
  try {
    const t = await db.ticket.update({ where: { id: ticketId }, data: { sprintId } });
    if (t.jiraKey && sprintId && jira.jiraConfigured()) {
      const s = await db.sprint.findUnique({ where: { id: sprintId } });
      if (s?.jiraId) await jira.moveToSprint(s.jiraId, [t.jiraKey]).catch(() => {});
    }
    touch(); return { ok: true };
  } catch (e) { return fail(e); }
}

/** Persist a drag-and-drop priority order for a list of ticket ids. */
export async function reorderAction(ids: string[]): Promise<Result> {
  try { await db.$transaction(ids.map((id, i) => db.ticket.update({ where: { id }, data: { rank: i + 1 } }))); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function autoFillSprintAction(sprintId: string): Promise<Result<{ added: number; skipped: number }>> {
  try {
    const sprint = await db.sprint.findUniqueOrThrow({ where: { id: sprintId } });
    const devs = await db.developer.findMany({ where: { role: { not: "Engineering Manager" } } });
    const weeks = Math.max(1, Math.round((sprint.endDate.getTime() - sprint.startDate.getTime()) / (7 * 86_400_000)));
    const capacity = devs.reduce((a, d) => a + d.capacityHrs * weeks, 0);
    const inSprint = await db.ticket.findMany({ where: { sprintId } });
    const remainingCap = capacity * 0.85 - inSprint.reduce((a, t) => a + (t.estimateHrs ?? 0), 0);
    const candidates = await db.ticket.findMany({ where: { sprintId: null, status: "BACKLOG", estimateHrs: { not: null } }, orderBy: { rank: "asc" } });
    const { take, leave } = fillSprint(candidates, Math.max(0, remainingCap) / 0.85);
    for (const t of take) await assignToSprintAction(t.id, sprintId);
    return { ok: true, added: take.length, skipped: leave.length };
  } catch (e) { return fail(e); }
}

export async function startSprintAction(sprintId: string): Promise<Result<{ moved: number }>> {
  try {
    const sprint = await db.sprint.findUniqueOrThrow({ where: { id: sprintId } });
    const active = await db.sprint.findFirst({ where: { state: "ACTIVE", NOT: { id: sprintId } } });
    if (active) return { ok: false, error: `${active.name} is still active. Close it first.` };
    const tickets = await db.ticket.findMany({ where: { sprintId, status: "BACKLOG" } });
    const unready = tickets.filter((t) => t.estimateHrs == null);
    if (unready.length) return { ok: false, error: `${unready.length} ticket(s) have no estimate: ${unready.slice(0, 4).map((t) => t.key).join(", ")}. Estimate them before starting.` };
    const now = new Date();
    let moved = 0;
    for (const t of tickets) { const r = await svc.moveTicket(t.id, "READY_TO_DEV"); if (r.ok) moved++; }
    await db.sprint.update({ where: { id: sprintId }, data: { state: "ACTIVE", startDate: now < sprint.startDate ? now : sprint.startDate } });
    if (sprint.jiraId && jira.jiraConfigured()) await jira.startSprint(sprint.jiraId, sprint.startDate, sprint.endDate).catch(() => {});
    touch(); return { ok: true, moved };
  } catch (e) { return fail(e); }
}

export async function closeSprintAction(sprintId: string): Promise<Result<{ carried: number }>> {
  try {
    const sprint = await db.sprint.findUniqueOrThrow({ where: { id: sprintId } });
    const unfinished = await db.ticket.findMany({ where: { sprintId, status: { notIn: ["DONE", "DEPLOYED_PROD"] } } });
    const next = await db.sprint.findFirst({ where: { state: "PLANNING" }, orderBy: { startDate: "asc" } });
    // Cards can't move backwards on the board, so unfinished work keeps its column and rolls into the next sprint.
    if (next) await db.ticket.updateMany({ where: { id: { in: unfinished.map((t) => t.id) } }, data: { sprintId: next.id } });
    await db.sprint.update({ where: { id: sprintId }, data: { state: "CLOSED", endDate: new Date() } });
    if (sprint.jiraId && jira.jiraConfigured()) await jira.closeSprint(sprint.jiraId).catch(() => {});
    touch(); return { ok: true, carried: next ? unfinished.length : 0 };
  } catch (e) { return fail(e); }
}

// ----- meetings & notes -----
export async function saveNotesAction(meetingId: string, transcript: string): Promise<Result<{ actions: number }>> {
  try {
    const names = (await db.developer.findMany()).map((d) => d.name);
    const parsed = await summariseWithClaude(transcript, parseNotes(transcript, names));
    await db.$transaction([
      db.meeting.update({ where: { id: meetingId }, data: { transcript, summary: parsed.summary, decisions: parsed.decisions } }),
      db.actionItem.deleteMany({ where: { meetingId } }),
      ...parsed.actionItems.map((a) => db.actionItem.create({ data: { meetingId, text: a.text, owner: a.owner, ticketId: undefined } })),
    ]);
    // Link action items that mention a ticket key
    for (const a of parsed.actionItems.filter((x) => x.ticketKey)) {
      const t = await db.ticket.findUnique({ where: { key: a.ticketKey! } });
      if (t) await db.actionItem.updateMany({ where: { meetingId, text: a.text }, data: { ticketId: t.id } });
    }
    revalidatePath("/meetings"); return { ok: true, actions: parsed.actionItems.length };
  } catch (e) { return fail(e); }
}
export async function toggleActionAction(id: string, done: boolean): Promise<Result> { try { await db.actionItem.update({ where: { id }, data: { done } }); revalidatePath("/meetings"); return { ok: true }; } catch (e) { return fail(e); } }

export async function actionToTicketAction(actionId: string, projectId: string): Promise<Result<{ key: string }>> {
  try {
    const a = await db.actionItem.findUniqueOrThrow({ where: { id: actionId } });
    const { ticket } = await svc.createTicket({ projectId, title: a.text.slice(0, 120), description: `Created from meeting action item.\nOwner: ${a.owner ?? "unassigned"}`, type: "TASK", priority: "MEDIUM" });
    await db.actionItem.update({ where: { id: actionId }, data: { ticketId: ticket.id } });
    touch(); return { ok: true, key: ticket.key };
  } catch (e) { return fail(e); }
}

/** Ensure the team cadence exists for the next `days`; create Google Meet events when Google is connected. */
export async function syncMeetingsAction(days = 14): Promise<Result<{ created: number; google: boolean }>> {
  try {
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const occ = occurrences(from, days);
    const existing = await db.meeting.findMany({ where: { startsAt: { gte: from } } });
    const have = new Set(existing.map((m) => `${m.kind}|${m.startsAt.toISOString()}`));
    const devs = await db.developer.findMany();
    let created = 0;
    for (const o of occ) {
      if (have.has(`${o.kind}|${o.startsAt.toISOString()}`)) continue;
      let meetUrl: string | undefined, googleEvId: string | undefined;
      if (gcal.googleConfigured()) {
        const r = await gcal.createMeetEvent({ title: o.title, start: o.startsAt, end: o.endsAt, attendees: devs.map((d) => d.email) }).catch(() => null);
        meetUrl = r?.meetUrl; googleEvId = r?.id;
      }
      await db.meeting.create({ data: { kind: o.kind, title: o.title, startsAt: o.startsAt, endsAt: o.endsAt, meetUrl, googleEvId, attendees: devs.map((d) => d.email) } });
      created++;
    }
    revalidatePath("/meetings"); return { ok: true, created, google: gcal.googleConfigured() };
  } catch (e) { return fail(e); }
}

/** One-off: create the whole weekly cadence as recurring Google Calendar events with Meet links. */
export async function createRecurringMeetEventsAction(): Promise<Result<{ created: number }>> {
  try {
    if (!gcal.googleConfigured()) return { ok: false, error: "Google is not configured (GOOGLE_CLIENT_ID / SECRET / REFRESH_TOKEN)." };
    const devs = await db.developer.findMany();
    let created = 0;
    for (const def of MEETING_DEFS) {
      const first = occurrences(new Date(), 8).find((o) => o.kind === def.kind)!;
      await gcal.createMeetEvent({ title: def.title, start: first.startsAt, end: first.endsAt, attendees: devs.map((d) => d.email), description: def.blurb, rrule: gcal.rruleFor(def.days) });
      created++;
    }
    return { ok: true, created };
  } catch (e) { return fail(e); }
}

// ----- integrations -----
export async function syncJiraAction(): Promise<Result<{ summary: string }>> {
  try { const s = await svc.syncSprintsFromJira(); const r = await svc.syncJira(); touch(); return { ok: true, summary: `${s} sprints, ${r.total} issues (${r.created} new, ${r.updated} updated)` }; } catch (e) { return fail(e); }
}
export async function syncGithubAction(): Promise<Result<{ summary: string }>> {
  try { const r = await svc.syncGithub(); touch(); return { ok: true, summary: `${r.linked} pull requests linked to tickets` }; } catch (e) { return fail(e); }
}
export async function fitAction(sprintId: string) {
  const devs = await db.developer.findMany({ where: { role: { not: "Engineering Manager" } } });
  const s = await db.sprint.findUniqueOrThrow({ where: { id: sprintId }, include: { tickets: true } });
  const weeks = Math.max(1, Math.round((s.endDate.getTime() - s.startDate.getTime()) / (7 * 86_400_000)));
  return sprintFit(devs.reduce((a, d) => a + d.capacityHrs * weeks, 0), s.tickets.map((t) => t.estimateHrs));
}

// ----- ticket creator helpers -----
export async function suggestEstimateAction(input: { type: string; points: number | null; complicated?: boolean }) {
  const { suggestEstimate } = await import("@/lib/estimation");
  const { historyForEstimation } = await import("@/lib/queries");
  return suggestEstimate(input, await historyForEstimation());
}

export async function bulkCreateAction(projectId: string, text: string, pushToJira: boolean): Promise<Result<{ keys: string[]; errors: string[] }>> {
  try {
    const { parseTicketLines } = await import("@/lib/ticket-parse");
    const keys: string[] = [], errors: string[] = [];
    for (const row of parseTicketLines(text)) {
      const r = await svc.createTicket({ ...row, projectId, pushToJira });
      keys.push(r.ticket.key); if (r.jiraError) errors.push(`${r.ticket.key}: ${r.jiraError.slice(0, 120)}`);
    }
    touch(); return { ok: true, keys, errors };
  } catch (e) { return fail(e); }
}
export async function previewBulkAction(text: string) {
  const { parseTicketLines } = await import("@/lib/ticket-parse");
  return parseTicketLines(text);
}
