"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import * as svc from "@/lib/services";
import * as jira from "@/lib/integrations/jira";
import * as gcal from "@/lib/integrations/google";
import { MEETING_DEFS, occurrences } from "@/lib/schedule";
import { currentUser, requireAccess, destroySession } from "@/lib/auth/session";
import { canMoveTicket, canPatchTicket, atLeast } from "@/lib/permissions";
import { fillSprint, sprintFit } from "@/lib/estimation";
import { STATUS_ORDER, type StatusKey } from "@/lib/workflow";
import type { ReviewItem } from "@/lib/review-template";
import { redirect } from "next/navigation";

type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof z.ZodError ? "Invalid input: " + e.issues[0]?.message : e instanceof Error ? e.message : String(e) });
const touch = () => { for (const p of ["/", "/board", "/sprints", "/time", "/estimation", "/meetings", "/analytics", "/tickets", "/team"]) revalidatePath(p); };
const me = () => requireAccess("DEVELOPER");

const priority = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
const ttype = z.enum(["BUG", "FEATURE", "ENHANCEMENT", "TASK"]);
const status = z.enum(STATUS_ORDER);
const id = z.string().min(1).max(64);

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

// ----- tickets -----
const newTicket = z.object({
  projectId: id, title: z.string().trim().min(1, "Title is required").max(240), description: z.string().max(20_000).optional(), type: ttype, priority,
  storyPoints: z.number().int().min(0).max(100).nullish(), estimateHrs: z.number().min(0).max(1000).nullish(), labels: z.array(z.string().max(40)).max(20).optional(),
  assigneeId: id.nullish(), sprintId: id.nullish(), complicated: z.boolean().optional(), pushToJira: z.boolean().optional(),
});

export async function createTicketAction(input: svc.NewTicket): Promise<Result<{ key: string; jiraError: string | null }>> {
  try {
    const user = await me();
    const data = newTicket.parse(input);
    // Developers can't assign other people or drop tickets straight into a sprint: that's sprint planning.
    if (!atLeast(user.access, "LEAD")) { data.assigneeId = null; data.sprintId = null; }
    const { ticket, jiraError } = await svc.createTicket(data as svc.NewTicket);
    touch();
    return { ok: true, key: ticket.key, jiraError };
  } catch (e) { return fail(e); }
}

export async function moveTicketAction(ticketId: string, to: StatusKey): Promise<Result<{ label: string; syncError: string | null }>> {
  try {
    const user = await me();
    status.parse(to);
    const t = await db.ticket.findUniqueOrThrow({ where: { id: id.parse(ticketId) } });
    if (!canMoveTicket({ id: user.id, access: user.access }, t, to))
      return { ok: false, error: atLeast(user.access, "LEAD") ? "Not allowed" : "You can move your own cards up to Review. Staging and production steps are done by a lead." };
    const r = await svc.moveTicket(ticketId, to, user.id);
    touch(); revalidatePath(`/tickets/${ticketId}`);
    return r.ok ? { ok: true, label: r.label, syncError: r.syncError } : { ok: false, error: r.error };
  } catch (e) { return fail(e); }
}

const patchSchema = z.object({
  assigneeId: id.nullable(), storyPoints: z.number().int().min(0).max(100).nullable(), estimateHrs: z.number().min(0).max(1000).nullable(),
  prUrl: z.string().url().max(300).regex(/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/, "Use a GitHub pull request URL").nullable(),
  complicated: z.boolean(), priority, title: z.string().trim().min(1).max(240), description: z.string().max(20_000),
}).partial().strict();

export async function updateTicketAction(ticketId: string, patch: z.input<typeof patchSchema>): Promise<Result> {
  try {
    const user = await me();
    const p = patchSchema.parse(patch);
    const t = await db.ticket.findUniqueOrThrow({ where: { id: id.parse(ticketId) } });
    if (!canPatchTicket({ id: user.id, access: user.access }, t, Object.keys(p)))
      return { ok: false, error: "You can edit your own tickets. Reassigning and re-prioritising are for leads." };
    const upd = await db.ticket.update({ where: { id: ticketId }, data: { ...p, ...(p.prUrl ? { prNumber: Number(p.prUrl.match(/pull\/(\d+)/)?.[1]) || null, prState: "open" } : {}) } });
    if (upd.jiraKey && (p.storyPoints != null || p.estimateHrs != null) && (await jira.jiraReady()))
      await jira.updateEstimate(upd.jiraKey, { points: p.storyPoints, hours: p.estimateHrs }).catch(() => {});
    touch(); revalidatePath(`/tickets/${ticketId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function setProgressAction(ticketId: string, pct: number, note?: string): Promise<Result> {
  try {
    const user = await me();
    const t = await db.ticket.findUniqueOrThrow({ where: { id: id.parse(ticketId) } });
    if (!atLeast(user.access, "LEAD") && t.assigneeId !== user.id) return { ok: false, error: "Only the assignee or a lead can log progress." };
    await svc.setProgress(ticketId, z.number().parse(pct), z.string().max(500).optional().parse(note));
    touch(); revalidatePath(`/tickets/${ticketId}`); return { ok: true };
  } catch (e) { return fail(e); }
}

// ----- time (always the signed-in user's own) -----
export async function clockInAction(): Promise<Result> { try { await svc.clockIn((await me()).id); touch(); return { ok: true }; } catch (e) { return fail(e); } }
export async function clockOutAction(): Promise<Result> { try { await svc.clockOut((await me()).id); touch(); return { ok: true }; } catch (e) { return fail(e); } }
export async function startTimerAction(ticketId: string): Promise<Result> { try { await svc.startTimer(id.parse(ticketId), (await me()).id); touch(); revalidatePath(`/tickets/${ticketId}`); return { ok: true }; } catch (e) { return fail(e); } }
export async function stopTimerAction(): Promise<Result> { try { await svc.stopTimer((await me()).id); touch(); return { ok: true }; } catch (e) { return fail(e); } }

// ----- reviews -----
export async function runReviewAction(ticketId: string): Promise<Result<{ source: string }>> {
  try { await me(); const r = await svc.runInitialReview(id.parse(ticketId)); revalidatePath(`/tickets/${ticketId}`); return { ok: true, source: r.source }; } catch (e) { return fail(e); }
}
export async function saveReviewAction(reviewId: string, ticketId: string, items: ReviewItem[]): Promise<Result<{ passed: boolean }>> {
  try {
    const user = await me();
    const review = await db.prReview.findUniqueOrThrow({ where: { id: id.parse(reviewId) }, include: { ticket: true } });
    if (review.kind === "REVIEWER" && !atLeast(user.access, "LEAD")) return { ok: false, error: "The reviewer checklist is for leads and admins." };
    // Only the checked flag may change: labels and severities come from the stored template, never from the client.
    const prev = review.items as unknown as ReviewItem[];
    const flags = new Map(items.map((i) => [i.id, !!i.checked]));
    const merged = prev.map((i) => ({ ...i, checked: flags.has(i.id) ? flags.get(i.id)! : i.checked }));
    const r = await svc.saveReview(reviewId, merged);
    revalidatePath(`/tickets/${ticketId}`); return { ok: true, passed: r.passed };
  } catch (e) { return fail(e); }
}
export async function startReviewerPassAction(ticketId: string): Promise<Result> {
  try {
    await requireAccess("LEAD");
    const { freshChecklist } = await import("@/lib/review-template");
    const n = await db.prReview.count({ where: { ticketId: id.parse(ticketId), kind: "REVIEWER" } });
    await db.prReview.create({ data: { ticketId, kind: "REVIEWER", round: n + 1, items: freshChecklist() as any } });
    revalidatePath(`/tickets/${ticketId}`); return { ok: true };
  } catch (e) { return fail(e); }
}

// ----- estimation -----
export async function voteAction(ticketId: string, hours: number): Promise<Result> {
  try {
    const user = await me();
    const h = z.number().positive().max(200).parse(hours);
    await db.estimateVote.upsert({ where: { ticketId_developerId: { ticketId: id.parse(ticketId), developerId: user.id } }, update: { hours: h }, create: { ticketId, developerId: user.id, hours: h } });
    revalidatePath("/estimation"); return { ok: true };
  } catch (e) { return fail(e); }
}
export async function clearVotesAction(ticketId: string): Promise<Result> { try { await requireAccess("LEAD"); await db.estimateVote.deleteMany({ where: { ticketId: id.parse(ticketId) } }); revalidatePath("/estimation"); return { ok: true }; } catch (e) { return fail(e); } }
export async function applyEstimateAction(ticketId: string, hours: number, points: number | null): Promise<Result> {
  try { await requireAccess("LEAD"); return await updateTicketAction(ticketId, { estimateHrs: hours, storyPoints: points }); } catch (e) { return fail(e); }
}

// ----- sprints (leads and admins) -----
export async function createSprintAction(input: { name: string; goal?: string; start: string; end: string }): Promise<Result<{ id: string }>> {
  try {
    await requireAccess("LEAD");
    const v = z.object({ name: z.string().trim().min(1).max(80), goal: z.string().max(300).optional(), start: z.string().date(), end: z.string().date() }).parse(input);
    if (new Date(v.end) <= new Date(v.start)) return { ok: false, error: "End date must be after the start date." };
    let jiraId: string | null = null;
    if (process.env.JIRA_BOARD_ID && (await jira.jiraReady())) jiraId = await jira.createSprint(v.name, new Date(v.start), new Date(v.end), v.goal).catch(() => null);
    const s = await db.sprint.create({ data: { name: v.name, goal: v.goal, startDate: new Date(v.start), endDate: new Date(v.end), jiraId } });
    touch(); return { ok: true, id: s.id };
  } catch (e) { return fail(e); }
}

export async function assignToSprintAction(ticketId: string, sprintId: string | null): Promise<Result> {
  try {
    await requireAccess("LEAD");
    const t = await db.ticket.update({ where: { id: id.parse(ticketId) }, data: { sprintId: sprintId ? id.parse(sprintId) : null } });
    if (t.jiraKey && sprintId && (await jira.jiraReady())) {
      const s = await db.sprint.findUnique({ where: { id: sprintId } });
      if (s?.jiraId) await jira.moveToSprint(s.jiraId, [t.jiraKey]).catch(() => {});
    }
    touch(); return { ok: true };
  } catch (e) { return fail(e); }
}

/** Persist a drag-and-drop priority order for a list of ticket ids. */
export async function reorderAction(ids: string[]): Promise<Result> {
  try { await requireAccess("LEAD"); await db.$transaction(z.array(id).max(500).parse(ids).map((tid, i) => db.ticket.update({ where: { id: tid }, data: { rank: i + 1 } }))); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function autoFillSprintAction(sprintId: string): Promise<Result<{ added: number; skipped: number }>> {
  try {
    await requireAccess("LEAD");
    const sprint = await db.sprint.findUniqueOrThrow({ where: { id: id.parse(sprintId) } });
    const devs = await db.developer.findMany({ where: { active: true, role: { not: "Engineering Manager" } } });
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
    await requireAccess("LEAD");
    const sprint = await db.sprint.findUniqueOrThrow({ where: { id: id.parse(sprintId) } });
    const active = await db.sprint.findFirst({ where: { state: "ACTIVE", NOT: { id: sprintId } } });
    if (active) return { ok: false, error: `${active.name} is still active. Close it first.` };
    const tickets = await db.ticket.findMany({ where: { sprintId, status: "BACKLOG" } });
    const unready = tickets.filter((t) => t.estimateHrs == null);
    if (unready.length) return { ok: false, error: `${unready.length} ticket(s) have no estimate: ${unready.slice(0, 4).map((t) => t.key).join(", ")}. Estimate them before starting.` };
    const now = new Date();
    let moved = 0;
    for (const t of tickets) { const r = await svc.moveTicket(t.id, "READY_TO_DEV"); if (r.ok) moved++; }
    await db.sprint.update({ where: { id: sprintId }, data: { state: "ACTIVE", startDate: now < sprint.startDate ? now : sprint.startDate } });
    if (sprint.jiraId && (await jira.jiraReady())) await jira.startSprint(sprint.jiraId, sprint.startDate, sprint.endDate).catch(() => {});
    touch(); return { ok: true, moved };
  } catch (e) { return fail(e); }
}

export async function closeSprintAction(sprintId: string): Promise<Result<{ carried: number }>> {
  try {
    await requireAccess("LEAD");
    const sprint = await db.sprint.findUniqueOrThrow({ where: { id: id.parse(sprintId) } });
    const unfinished = await db.ticket.findMany({ where: { sprintId, status: { notIn: ["DONE", "DEPLOYED_PROD"] } } });
    const next = await db.sprint.findFirst({ where: { state: "PLANNING" }, orderBy: { startDate: "asc" } });
    // Cards can't move backwards on the board, so unfinished work keeps its column and rolls into the next sprint.
    if (next) await db.ticket.updateMany({ where: { id: { in: unfinished.map((t) => t.id) } }, data: { sprintId: next.id } });
    await db.sprint.update({ where: { id: sprintId }, data: { state: "CLOSED", endDate: new Date() } });
    if (sprint.jiraId && (await jira.jiraReady())) await jira.closeSprint(sprint.jiraId).catch(() => {});
    touch(); return { ok: true, carried: next ? unfinished.length : 0 };
  } catch (e) { return fail(e); }
}

// ----- meetings & notes -----
export async function saveNotesAction(meetingId: string, transcript: string): Promise<Result<{ actions: number }>> {
  try {
    await me();
    const parsed = await svc.generateNotes(id.parse(meetingId), z.string().min(1).max(200_000).parse(transcript));
    revalidatePath("/meetings"); return { ok: true, actions: parsed.actionItems.length };
  } catch (e) { return fail(e); }
}

/** Fetch the real Google Meet transcript of an ended meeting and generate notes from it. */
export async function importTranscriptAction(meetingId: string): Promise<Result<{ actions: number; chars: number }>> {
  try {
    await me();
    const r = await svc.importMeetTranscript(id.parse(meetingId));
    if (!r) return { ok: false, error: "No transcript yet. Meet publishes it a few minutes after the call, and only if Transcript was turned on in the meeting." };
    revalidatePath("/meetings"); return { ok: true, actions: r.parsed.actionItems.length, chars: r.chars };
  } catch (e) { return fail(e); }
}

export async function toggleActionAction(actionId: string, done: boolean): Promise<Result> { try { await me(); await db.actionItem.update({ where: { id: id.parse(actionId) }, data: { done } }); revalidatePath("/meetings"); return { ok: true }; } catch (e) { return fail(e); } }

export async function actionToTicketAction(actionId: string, projectId: string): Promise<Result<{ key: string }>> {
  try {
    await me();
    const a = await db.actionItem.findUniqueOrThrow({ where: { id: id.parse(actionId) } });
    const { ticket } = await svc.createTicket({ projectId: id.parse(projectId), title: a.text.slice(0, 120), description: `Created from meeting action item.\nOwner: ${a.owner ?? "unassigned"}`, type: "TASK", priority: "MEDIUM" });
    await db.actionItem.update({ where: { id: actionId }, data: { ticketId: ticket.id } });
    touch(); return { ok: true, key: ticket.key };
  } catch (e) { return fail(e); }
}

/** Ensure the team cadence exists for the next `days`; links existing calendar events or creates Meet events. */
export async function syncMeetingsAction(days = 14): Promise<Result<{ created: number; linked: number; google: boolean }>> {
  try {
    await requireAccess("LEAD");
    const r = await svc.syncMeetingCadence(z.number().int().min(1).max(60).parse(days));
    revalidatePath("/meetings"); return { ok: true, ...r };
  } catch (e) { return fail(e); }
}

/** One-off: create the whole weekly cadence as recurring Google Calendar events with Meet links. */
export async function createRecurringMeetEventsAction(): Promise<Result<{ created: number }>> {
  try {
    await requireAccess("LEAD");
    if (!(await gcal.googleReady())) return { ok: false, error: "Connect Google Calendar & Meet first (Integrations)." };
    const devs = await db.developer.findMany({ where: { active: true } });
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
  try { await requireAccess("LEAD"); const s = await svc.syncSprintsFromJira(); const r = await svc.syncJira(); touch(); return { ok: true, summary: `${s} sprints, ${r.total} issues (${r.created} new, ${r.updated} updated)` }; } catch (e) { return fail(e); }
}
export async function syncGithubAction(): Promise<Result<{ summary: string }>> {
  try { await requireAccess("LEAD"); const r = await svc.syncGithub(); touch(); return { ok: true, summary: `${r.linked} pull requests linked to tickets` }; } catch (e) { return fail(e); }
}

// ----- ticket creator helpers -----
export async function suggestEstimateAction(input: { type: string; points: number | null; complicated?: boolean }) {
  await me();
  const { suggestEstimate } = await import("@/lib/estimation");
  const { historyForEstimation } = await import("@/lib/queries");
  return suggestEstimate(input, await historyForEstimation());
}

export async function bulkCreateAction(projectId: string, text: string, pushToJira: boolean): Promise<Result<{ keys: string[]; errors: string[] }>> {
  try {
    await me();
    const { parseTicketLines } = await import("@/lib/ticket-parse");
    const rows = parseTicketLines(z.string().max(50_000).parse(text)).slice(0, 100);
    const keys: string[] = [], errors: string[] = [];
    for (const row of rows) {
      const r = await svc.createTicket({ ...row, projectId: id.parse(projectId), pushToJira });
      keys.push(r.ticket.key); if (r.jiraError) errors.push(`${r.ticket.key}: ${r.jiraError.slice(0, 120)}`);
    }
    touch(); return { ok: true, keys, errors };
  } catch (e) { return fail(e); }
}
export async function previewBulkAction(text: string) {
  await me();
  const { parseTicketLines } = await import("@/lib/ticket-parse");
  return parseTicketLines(z.string().max(50_000).parse(text));
}

// ----- admin -----
export async function setAccessAction(userId: string, access: "DEVELOPER" | "LEAD" | "ADMIN"): Promise<Result> {
  try {
    const admin = await requireAccess("ADMIN");
    z.enum(["DEVELOPER", "LEAD", "ADMIN"]).parse(access);
    if (userId === admin.id && access !== "ADMIN" && (await db.developer.count({ where: { access: "ADMIN", active: true } })) <= 1) return { ok: false, error: "You are the only admin. Make someone else an admin first." };
    await db.developer.update({ where: { id: id.parse(userId) }, data: { access } });
    revalidatePath("/admin/users"); return { ok: true };
  } catch (e) { return fail(e); }
}
export async function setActiveAction(userId: string, active: boolean): Promise<Result> {
  try {
    const admin = await requireAccess("ADMIN");
    if (userId === admin.id) return { ok: false, error: "You can't deactivate yourself." };
    await db.developer.update({ where: { id: id.parse(userId) }, data: { active } });
    if (!active) await db.authSession.deleteMany({ where: { userId } }); // sign them out everywhere
    revalidatePath("/admin/users"); return { ok: true };
  } catch (e) { return fail(e); }
}
export async function updateProfileAction(userId: string, patch: { capacityHrs?: number; role?: string; githubLogin?: string | null }): Promise<Result> {
  try {
    const user = await me();
    if (userId !== user.id && !atLeast(user.access, "ADMIN")) return { ok: false, error: "You can only edit your own profile." };
    const p = z.object({ capacityHrs: z.number().min(0).max(80), role: z.string().trim().max(60), githubLogin: z.string().trim().max(60).nullable() }).partial().strict().parse(patch);
    await db.developer.update({ where: { id: id.parse(userId) }, data: { ...p, githubLogin: p.githubLogin === "" ? null : p.githubLogin } });
    revalidatePath("/admin/users"); revalidatePath("/settings"); return { ok: true };
  } catch (e) { return fail(e); }
}

export async function fitAction(sprintId: string) {
  await me();
  const devs = await db.developer.findMany({ where: { active: true, role: { not: "Engineering Manager" } } });
  const s = await db.sprint.findUniqueOrThrow({ where: { id: sprintId }, include: { tickets: true } });
  const weeks = Math.max(1, Math.round((s.endDate.getTime() - s.startDate.getTime()) / (7 * 86_400_000)));
  return sprintFit(devs.reduce((a, d) => a + d.capacityHrs * weeks, 0), s.tickets.map((t) => t.estimateHrs));
}
void currentUser;
