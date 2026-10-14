"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { isTheme } from "@/lib/theme";
import { getReviewConfig, saveReviewConfig, type ReviewConfig } from "@/lib/review-config";
import { z } from "zod";
import { db } from "@/lib/db";
import * as svc from "@/lib/services";
import * as jira from "@/lib/integrations/jira";
import * as gcal from "@/lib/integrations/google";
import { occurrences } from "@/lib/schedule";
import { getMeetingDefs, getMeetingSettings, getWorkspace, parseHHMM, saveMeetingSettings, saveWorkspace, type MeetingSetting, type WorkspaceConfig } from "@/lib/config";
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
    // Entering Initial Review kicks off the Claude review of the linked PR (in the background: it can take a minute).
    if (r.ok && to === "INITIAL_REVIEW" && t.prUrl && (await getReviewConfig()).autoRun) after(async () => { await svc.runInitialReview(ticketId, "move").catch(() => {}); });
    touch(); revalidatePath(`/tickets/${ticketId}`);
    return r.ok ? { ok: true, label: r.label, syncError: r.syncError } : { ok: false, error: r.error };
  } catch (e) { return fail(e); }
}

const patchSchema = z.object({
  assigneeId: id.nullable(), storyPoints: z.number().int().min(0).max(100).nullable(), estimateHrs: z.number().min(0).max(1000).nullable(),
  prUrl: z.string().url().max(300).regex(/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/, "Use a GitHub pull request URL").nullable(),
  complicated: z.boolean(), priority, title: z.string().trim().min(1).max(240), description: z.string().max(20_000),
}).partial().strict();

export async function updateTicketAction(ticketId: string, patch: z.input<typeof patchSchema>): Promise<Result<{ jira?: svc.PushResult }>> {
  try {
    const user = await me();
    const p = patchSchema.parse(patch);
    const t = await db.ticket.findUniqueOrThrow({ where: { id: id.parse(ticketId) } });
    if (!canPatchTicket({ id: user.id, access: user.access }, t, Object.keys(p)))
      return { ok: false, error: "You can edit your own tickets. Reassigning and re-prioritising are for leads." };
    const upd = await db.ticket.update({ where: { id: ticketId }, data: { ...p, ...(p.prUrl ? { prNumber: Number(p.prUrl.match(/pull\/(\d+)/)?.[1]) || null, prState: "open" } : {}) } });
    // An estimate change is written straight to the real Jira issue, in the unit that project uses.
    const jiraResult = upd.jiraKey && (p.storyPoints != null || p.estimateHrs != null) ? await svc.pushEstimate(upd.id) : undefined;
    touch(); revalidatePath(`/tickets/${ticketId}`);
    return { ok: true, jira: jiraResult };
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
export async function runReviewAction(ticketId: string): Promise<Result> {
  try {
    await me();
    const tid = id.parse(ticketId);
    after(async () => { await svc.runInitialReview(tid, "manual").catch(() => {}); revalidatePath(`/tickets/${tid}`); });
    return { ok: true };
  } catch (e) { return fail(e); }
}
export async function saveReviewAction(reviewId: string, ticketId: string, items: ReviewItem[]): Promise<Result<{ passed: boolean }>> {
  try {
    const user = await me();
    const review = await db.prReview.findUniqueOrThrow({ where: { id: id.parse(reviewId) }, include: { ticket: true } });
    if (review.kind === "REVIEWER" && !atLeast(user.access, "LEAD")) return { ok: false, error: "The reviewer checklist is for leads and admins." };
    if (review.status === "RUNNING") return { ok: false, error: "The review is still running." };
    // A Claude / scan result can only be overridden by a lead; the assignee can tick a manual checklist.
    if (review.kind === "INITIAL_CLAUDE" && !atLeast(user.access, "LEAD") && (review.source !== "manual" || review.ticket.assigneeId !== user.id))
      return { ok: false, error: "Claude's review can only be overridden by a lead. Fix the findings, push, and it re-runs." };
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
    const t = await db.ticket.findUniqueOrThrow({ where: { id: id.parse(ticketId) }, include: { project: true } });
    const { templateFor } = await import("@/lib/review-config");
    const n = await db.prReview.count({ where: { ticketId: t.id, kind: "REVIEWER" } });
    await db.prReview.create({ data: { ticketId: t.id, kind: "REVIEWER", round: n + 1, items: templateFor(await getReviewConfig(), t.project.key).items as any } });
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
export async function applyEstimateAction(ticketId: string, hours: number, points: number | null): Promise<Result<{ jira?: svc.PushResult }>> {
  try { await requireAccess("LEAD"); return await updateTicketAction(ticketId, { estimateHrs: hours, storyPoints: points }); } catch (e) { return fail(e); }
}

// ----- sprints (leads and admins) -----
export async function createSprintAction(input: { name: string; goal?: string; start: string; end: string }): Promise<Result<{ id: string }>> {
  try {
    await requireAccess("LEAD");
    const v = z.object({ name: z.string().trim().min(1).max(80), goal: z.string().max(300).optional(), start: z.string().date(), end: z.string().date() }).parse(input);
    if (new Date(v.end) <= new Date(v.start)) return { ok: false, error: "End date must be after the start date." };
    let jiraId: string | null = null;
    if ((await getWorkspace()).jira.boardId && (await jira.jiraReady())) jiraId = await jira.createSprint(v.name, new Date(v.start), new Date(v.end), v.goal).catch(() => null);
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
    const buffer = (await getWorkspace()).bufferPct / 100;
    const remainingCap = capacity * (1 - buffer) - inSprint.reduce((a, t) => a + (t.estimateHrs ?? 0), 0);
    const candidates = await db.ticket.findMany({ where: { sprintId: null, status: "BACKLOG", estimateHrs: { not: null } }, orderBy: { rank: "asc" } });
    const { take, leave } = fillSprint(candidates, Math.max(0, remainingCap) / (1 - buffer), buffer * 100);
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
    const unready = tickets.filter((t) => t.estimateHrs == null && t.storyPoints == null);
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
    for (const def of (await getMeetingDefs()).filter((d) => d.enabled && !d.meetUrl)) {
      const first = occurrences(new Date(), 8, [def])[0];
      if (!first) continue;
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
  return sprintFit(devs.reduce((a, d) => a + d.capacityHrs * weeks, 0), s.tickets.map((t) => t.estimateHrs), (await getWorkspace()).bufferPct);
}
void currentUser;

// ----- Jira: estimate write-back, realtime poll, status mapping -----
export async function pushSprintEstimatesAction(sprintId: string): Promise<Result<{ synced: number; skipped: number; failed: { key: string; message: string }[]; mode: "points" | "hours" | null }>> {
  try { await requireAccess("LEAD"); const r = await svc.pushSprintEstimates(id.parse(sprintId)); touch(); return { ok: true, ...r }; } catch (e) { return fail(e); }
}

/** Called by the board's poller (every ~30 s) when the webhook can't reach the app. */
export async function liveSyncAction(): Promise<Result<{ changed: number; lastSync: string | null }>> {
  try { await me(); const r = await svc.liveSync(); if (r.ran && r.changed) touch(); return { ok: true, changed: r.changed, lastSync: r.lastSync }; } catch (e) { return fail(e); }
}

export async function refreshBoardAction(): Promise<Result> {
  try { await requireAccess("LEAD"); await svc.syncBoard(); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

const statusMapSchema = z.record(z.string().max(120), z.union([z.literal(""), z.enum(STATUS_ORDER as unknown as [StatusKey, ...StatusKey[]])]));
export async function saveStatusMapAction(map: Record<string, string>): Promise<Result> {
  try { await requireAccess("ADMIN"); await jira.saveStatusMap(statusMapSchema.parse(map)); touch(); revalidatePath("/settings"); return { ok: true }; } catch (e) { return fail(e); }
}

// ----- admin: meetings and workspace settings -----
const MEET_LINK = /^https:\/\/meet\.google\.com\/[A-Za-z0-9\-_/?=&.]+$/;
const meetLink = z.string().trim().max(200).refine((v) => v === "" || MEET_LINK.test(v), "Use a Google Meet link, like https://meet.google.com/abc-defg-hij");
const hhmmStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");
const minutes = (t: string) => { const [h, m] = parseHHMM(t); return h * 60 + m; };

const meetingSchema = z.array(z.object({
  kind: z.enum(["STANDUP", "GROOMING", "ESTIMATION", "SPRINT_PLAN", "WEEKLY_SUMMARY", "DEMO"]),
  title: z.string().trim().min(1).max(80), days: z.array(z.number().int().min(0).max(6)).max(7), start: hhmmStr, end: hhmmStr,
  enabled: z.boolean(), meetUrl: meetLink, blurb: z.string().trim().max(200),
}).refine((m) => minutes(m.end) > minutes(m.start), { message: "A meeting must end after it starts" })
  .refine((m) => !m.enabled || m.days.length > 0, { message: "Pick at least one day for each enabled meeting" })).length(6);

/** Admin: edit the recurring meeting schedule and each meeting's fixed Google Meet link, then rebuild the upcoming meetings. */
export async function saveMeetingsAction(list: MeetingSetting[]): Promise<Result<{ created: number; removed: number }>> {
  try {
    await requireAccess("ADMIN");
    const parsed = meetingSchema.parse(list) as MeetingSetting[];
    await saveMeetingSettings(parsed);
    const r = await svc.rebuildUpcomingMeetings();
    touch(); revalidatePath("/admin/meetings");
    return { ok: true, created: r.created, removed: r.removed };
  } catch (e) { return fail(e); }
}

/** Admin: set or clear the Meet link of one upcoming meeting. */
export async function setMeetingLinkAction(meetingId: string, url: string): Promise<Result> {
  try {
    await requireAccess("ADMIN");
    const link = meetLink.parse(url);
    await db.meeting.update({ where: { id: id.parse(meetingId) }, data: { meetUrl: link || null } });
    touch(); revalidatePath("/admin/meetings");
    return { ok: true };
  } catch (e) { return fail(e); }
}

const workspaceSchema = z.object({
  timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Unknown timezone"),
  workStart: hhmmStr, workEnd: hhmmStr,
  sprintLengthDays: z.number().int().min(1).max(42), sprintStartWeekday: z.number().int().min(0).max(6),
  defaultCapacityHrs: z.number().min(1).max(80), bufferPct: z.number().min(0).max(50),
  jira: z.object({
    projectKey: z.string().trim().regex(/^([A-Z][A-Z0-9_]{1,9})?$/, "Project key is upper-case letters/digits, like ATL"),
    boardId: z.string().trim().regex(/^\d{0,10}$/, "Board id is a number"),
    storyPointsField: z.string().trim().regex(/^(customfield_\d+)?$/, "Looks like customfield_10016"),
    sprintField: z.string().trim().regex(/^(customfield_\d+)?$/, "Looks like customfield_10020"),
  }),
  github: z.object({ org: z.string().trim().regex(/^([A-Za-z0-9-]{1,39})?$/, "Not a valid GitHub org name") }),
}).refine((c) => minutes(c.workEnd) > minutes(c.workStart), { message: "Work day must end after it starts" });

/** Admin: workspace settings (timezone, hours, sprint cadence, capacity defaults, Jira and GitHub mapping). */
export async function saveWorkspaceAction(input: WorkspaceConfig): Promise<Result> {
  try {
    await requireAccess("ADMIN");
    await saveWorkspace(workspaceSchema.parse(input) as WorkspaceConfig);
    jira.resetBoardCache();
    touch(); revalidatePath("/admin/workspace"); revalidatePath("/settings");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Admin: which GitHub repo (org/name) and display name each project uses. */
export async function saveProjectAction(projectId: string, patch: { name: string; repo: string }): Promise<Result> {
  try {
    await requireAccess("ADMIN");
    const v = z.object({ name: z.string().trim().min(1).max(80), repo: z.string().trim().regex(/^([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)?$/, "Use org/repo, like spaceitlabs/api") }).parse(patch);
    await db.project.update({ where: { id: id.parse(projectId) }, data: { name: v.name, repo: v.repo || null } });
    touch(); revalidatePath("/admin/workspace");
    return { ok: true };
  } catch (e) { return fail(e); }
}
void getMeetingSettings;

// ----- admin: review template -----
const templateItem = z.object({ id: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_+\-]+$/), label: z.string().trim().min(1).max(200), severity: z.enum(["critical", "important"]), enabled: z.boolean() });
const projectReview = z.object({ guidance: z.string().max(4000), items: z.array(templateItem).max(40) });
const reviewConfigSchema = z.object({
  autoRun: z.boolean(), postToPr: z.boolean(),
  global: projectReview.extend({ items: z.array(templateItem).min(1).max(60) }),
  projects: z.record(z.string().max(12), projectReview),
}).refine((c) => new Set(c.global.items.map((i) => i.id)).size === c.global.items.length, "Duplicate checklist ids");

/** Admin: the PR review template (team points + per-project points and guidance) and when reviews run. */
export async function saveReviewConfigAction(input: ReviewConfig): Promise<Result> {
  try {
    await requireAccess("ADMIN");
    await saveReviewConfig(reviewConfigSchema.parse(input) as ReviewConfig);
    revalidatePath("/admin/review");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** The signed-in user's colour theme (light, dark or follow the system). */
export async function setThemeAction(theme: string): Promise<Result> {
  try { const user = await me(); if (!isTheme(theme)) return { ok: false, error: "Unknown theme" }; await db.developer.update({ where: { id: user.id }, data: { theme } }); return { ok: true }; } catch (e) { return fail(e); }
}
