import { db } from "./db";
import { gateError, STATUS_META, type StatusKey } from "./workflow";
import * as jira from "./integrations/jira";
import * as gh from "./integrations/github";
import { freshChecklist, reviewPassed, scanDiff, type ReviewItem } from "./review-template";

const warn = (where: string, e: unknown) => console.warn(`[${where}]`, e instanceof Error ? e.message : e);

// ---------- Tickets ----------
export async function nextTicketKey(projectId: string) {
  const p = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const last = await db.ticket.findMany({ where: { projectId, key: { startsWith: p.key + "-" } }, select: { key: true } });
  const n = last.reduce((m, t) => Math.max(m, Number(t.key.split("-")[1]) || 0), 0);
  return `${p.key}-${n + 1}`;
}

export interface NewTicket {
  projectId: string; title: string; description?: string; type: "BUG" | "FEATURE" | "ENHANCEMENT" | "TASK";
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; storyPoints?: number | null; estimateHrs?: number | null; labels?: string[];
  assigneeId?: string | null; sprintId?: string | null; complicated?: boolean; pushToJira?: boolean;
}

export async function createTicket(t: NewTicket) {
  let key = await nextTicketKey(t.projectId);
  let jiraKey: string | null = null;
  let jiraError: string | null = null;
  if (t.pushToJira !== false && jira.jiraConfigured()) {
    try {
      const assignee = t.assigneeId ? (await db.developer.findUnique({ where: { id: t.assigneeId } }))?.jiraAccount ?? undefined : undefined;
      jiraKey = await jira.createIssue({ ...t, description: t.description ?? "", assigneeAccountId: assignee });
      key = jiraKey;
    } catch (e) { jiraError = e instanceof Error ? e.message : String(e); warn("jira.create", e); }
  }
  const top = await db.ticket.aggregate({ where: { status: "BACKLOG" }, _max: { rank: true } });
  const ticket = await db.ticket.create({
    data: {
      key, jiraKey, title: t.title, description: t.description ?? "", type: t.type, priority: t.priority, storyPoints: t.storyPoints ?? null,
      estimateHrs: t.estimateHrs ?? null, labels: t.labels ?? [], projectId: t.projectId, assigneeId: t.assigneeId ?? null,
      sprintId: t.sprintId ?? null, complicated: t.complicated ?? false, rank: (top._max.rank ?? 0) + 1,
    },
  });
  return { ticket, jiraError };
}

export async function latestInitialReviewPassed(ticketId: string) {
  const r = await db.prReview.findFirst({ where: { ticketId, kind: "INITIAL_CLAUDE" }, orderBy: { createdAt: "desc" } });
  return !!r?.passed;
}

export async function moveTicket(ticketId: string, to: StatusKey, byId?: string | null) {
  const t = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  const from = t.status as StatusKey;
  const err = gateError(from, to, {
    assigneeId: t.assigneeId, sprintId: t.sprintId, estimateHrs: t.estimateHrs, prUrl: t.prUrl,
    initialReviewPassed: to === "REVIEW" ? await latestInitialReviewPassed(ticketId) : true,
  });
  if (err) return { ok: false as const, error: err };

  const now = new Date();
  const data: Record<string, unknown> = { status: to };
  if (to === "IN_PROGRESS" && !t.startedAt) data.startedAt = now;
  if (to === "IN_PROGRESS" && from === "FAILED_STG") { data.progressPct = Math.min(t.progressPct, 80); }
  if (to === "INITIAL_REVIEW" || to === "REVIEW") data.progressPct = 100;
  if (to === "DEPLOYED_PROD") data.doneAt = now;
  if (to === "DONE" && !t.doneAt) data.doneAt = now;
  await db.$transaction([
    db.ticket.update({ where: { id: ticketId }, data }),
    db.transition.create({ data: { ticketId, from, to, byId: byId ?? null } }),
  ]);
  // Stop running timers when work leaves the developer's hands.
  if (to !== "IN_PROGRESS") await db.timeEntry.updateMany({ where: { ticketId, endedAt: null }, data: { endedAt: now } });

  let syncError: string | null = null;
  if (t.jiraKey && jira.jiraConfigured()) {
    try { await jira.transitionIssue(t.jiraKey, to); } catch (e) { syncError = e instanceof Error ? e.message : String(e); warn("jira.transition", e); }
  }
  return { ok: true as const, from, to, label: STATUS_META[to].label, syncError };
}

// ---------- Time tracking ----------
export async function startTimer(ticketId: string, developerId: string) {
  const now = new Date();
  await db.timeEntry.updateMany({ where: { developerId, endedAt: null }, data: { endedAt: now } }); // one timer at a time
  const open = await db.workSession.findFirst({ where: { developerId, endedAt: null } });
  if (!open) await db.workSession.create({ data: { developerId, startedAt: now } }); // auto clock-in
  return db.timeEntry.create({ data: { ticketId, developerId, startedAt: now } });
}

export async function stopTimer(developerId: string) {
  const now = new Date();
  const open = await db.timeEntry.findMany({ where: { developerId, endedAt: null }, include: { ticket: true } });
  await db.timeEntry.updateMany({ where: { developerId, endedAt: null }, data: { endedAt: now } });
  for (const e of open) {
    if (e.ticket.jiraKey && jira.jiraConfigured()) {
      const secs = (now.getTime() - e.startedAt.getTime()) / 1000;
      if (secs >= 60) jira.addWorklog(e.ticket.jiraKey, e.startedAt, secs).catch((er) => warn("jira.worklog", er));
    }
  }
}

export async function clockIn(developerId: string) {
  const open = await db.workSession.findFirst({ where: { developerId, endedAt: null } });
  return open ?? db.workSession.create({ data: { developerId, startedAt: new Date() } });
}
export async function clockOut(developerId: string) {
  await stopTimer(developerId);
  await db.workSession.updateMany({ where: { developerId, endedAt: null }, data: { endedAt: new Date() } });
}

// ---------- Progress ----------
export async function setProgress(ticketId: string, pct: number, note?: string) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  await db.$transaction([
    db.ticket.update({ where: { id: ticketId }, data: { progressPct: v } }),
    db.progressLog.create({ data: { ticketId, pct: v, note: note || null } }),
  ]);
}

// ---------- Reviews ----------
export async function runInitialReview(ticketId: string) {
  const t = await db.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: { project: true } });
  const prev = await db.prReview.count({ where: { ticketId, kind: "INITIAL_CLAUDE" } });
  let items: ReviewItem[] = freshChecklist();
  let source = "template";
  const pr = t.prUrl ? gh.parsePrUrl(t.prUrl) : null;
  if (pr && gh.githubConfigured()) {
    try { items = scanDiff(await gh.getPullDiff(pr.repo, pr.number)); source = "diff scan"; } catch (e) { warn("github.diff", e); }
  }
  const review = await db.prReview.create({ data: { ticketId, kind: "INITIAL_CLAUDE", round: prev + 1, items: items as any, passed: reviewPassed(items) } });
  return { review, source };
}

export async function saveReview(reviewId: string, items: ReviewItem[]) {
  return db.prReview.update({ where: { id: reviewId }, data: { items: items as any, passed: reviewPassed(items) } });
}

// ---------- Sync ----------
export async function syncJira() {
  const issues = await jira.searchIssues();
  const project = await db.project.findFirst({ orderBy: { key: "asc" } });
  if (!project) throw new Error("Create a project first");
  const devs = await db.developer.findMany();
  let created = 0, updated = 0;
  for (const i of issues) {
    const status = jira.statusFromJira(i.status) ?? "BACKLOG";
    const dev = devs.find((d) => (i.assigneeEmail && d.email === i.assigneeEmail) || (i.assigneeId && d.jiraAccount === i.assigneeId));
    let sprintId: string | null = null;
    if (i.sprintId) {
      const sp = await db.sprint.findFirst({ where: { jiraId: i.sprintId } });
      sprintId = sp?.id ?? null;
    }
    const proj = (await db.project.findFirst({ where: { key: i.key.split("-")[0] } })) ?? project;
    const existing = await db.ticket.findUnique({ where: { key: i.key } });
    const data = {
      title: i.title, description: i.description, type: i.type as any, priority: i.priority as any, status: status as any,
      storyPoints: i.points ? Math.round(i.points) : null, labels: i.labels, jiraKey: i.key, assigneeId: dev?.id ?? null, sprintId,
      estimateHrs: i.estimateHrs ?? existing?.estimateHrs ?? null,
    };
    if (existing) {
      // Never let a stale Jira poll move a card backwards.
      const order = ["BACKLOG", "READY_TO_DEV", "IN_PROGRESS", "INITIAL_REVIEW", "REVIEW", "DEPLOYED_STG", "FAILED_STG", "DOCUMENTED", "DEPLOYED_PROD", "DONE"];
      const keep = order.indexOf(existing.status) > order.indexOf(status) && !(existing.status === "FAILED_STG" && status === "IN_PROGRESS");
      await db.ticket.update({ where: { id: existing.id }, data: keep ? { ...data, status: existing.status } : data });
      updated++;
    } else {
      await db.ticket.create({ data: { ...data, key: i.key, projectId: proj.id } }); created++;
    }
  }
  return { created, updated, total: issues.length };
}

export async function syncSprintsFromJira() {
  const sprints = await jira.listSprints();
  for (const s of sprints) {
    const found = await db.sprint.findFirst({ where: { jiraId: String(s.id) } });
    const data = { name: s.name, goal: s.goal ?? null, state: (s.state === "active" ? "ACTIVE" : s.state === "closed" ? "CLOSED" : "PLANNING") as any, startDate: s.startDate ? new Date(s.startDate) : new Date(), endDate: s.endDate ? new Date(s.endDate) : new Date(Date.now() + 14 * 86400000), jiraId: String(s.id) };
    if (found) await db.sprint.update({ where: { id: found.id }, data }); else await db.sprint.create({ data });
  }
  return sprints.length;
}

export async function syncGithub() {
  const projects = await db.project.findMany({ where: { repo: { not: null } } });
  let linked = 0;
  for (const p of projects) {
    const prs = await gh.listPullRequests(p.repo!, "all");
    for (const pr of prs) {
      const key = gh.ticketKeyFrom(`${pr.title} ${pr.branch}`);
      if (!key) continue;
      const t = await db.ticket.findUnique({ where: { key } });
      if (!t) continue;
      await db.ticket.update({ where: { id: t.id }, data: { prUrl: pr.url, prNumber: pr.number, prState: pr.state } });
      linked++;
    }
  }
  return { linked };
}
