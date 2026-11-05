import { db } from "./db";
import { STATUS_ORDER, DONE_STATES, type StatusKey } from "./workflow";
import { burndown, sumEntries, avgCycleDays, accuracy } from "./analytics";
import { hours } from "./time";

export const DAY = 86_400_000;

export async function activeSprint() {
  return (await db.sprint.findFirst({ where: { state: "ACTIVE" }, orderBy: { startDate: "desc" } }))
    ?? (await db.sprint.findFirst({ where: { state: "PLANNING" }, orderBy: { startDate: "asc" } }));
}

export async function sprintSnapshot(sprintId: string) {
  const sprint = await db.sprint.findUniqueOrThrow({ where: { id: sprintId } });
  const tickets = await db.ticket.findMany({ where: { sprintId }, include: { assignee: true, project: true, timeEntries: true }, orderBy: { rank: "asc" } });
  const now = new Date();
  const isDone = (s: string) => (DONE_STATES as string[]).includes(s);
  const points = tickets.reduce((a, t) => a + (t.storyPoints ?? 0), 0);
  const donePts = tickets.filter((t) => isDone(t.status)).reduce((a, t) => a + (t.storyPoints ?? 0), 0);
  const estHrs = tickets.reduce((a, t) => a + (t.estimateHrs ?? 0), 0);
  const loggedHrs = hours(tickets.reduce((a, t) => a + sumEntries(t.timeEntries, now), 0));
  const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, tickets.filter((t) => t.status === s).length])) as Record<StatusKey, number>;
  const burn = burndown(sprint.startDate, sprint.endDate, tickets.map((t) => ({ points: t.storyPoints ?? 0, hours: t.estimateHrs ?? 0, doneAt: isDone(t.status) ? t.doneAt ?? now : null })), now);
  const daysLeft = Math.max(0, Math.ceil((sprint.endDate.getTime() - now.getTime()) / DAY));
  const totalDays = Math.max(1, Math.round((sprint.endDate.getTime() - sprint.startDate.getTime()) / DAY));
  const elapsedPct = Math.min(100, Math.max(0, ((now.getTime() - sprint.startDate.getTime()) / (sprint.endDate.getTime() - sprint.startDate.getTime())) * 100));
  return { sprint, tickets, points, donePts, estHrs, loggedHrs, byStatus, burn, daysLeft, totalDays, elapsedPct, now };
}

/** Closed-sprint velocity per developer & team. */
export async function velocity() {
  const sprints = await db.sprint.findMany({ where: { state: { in: ["CLOSED", "ACTIVE"] } }, orderBy: { startDate: "asc" }, include: { tickets: { include: { assignee: true, timeEntries: true } } } });
  const now = new Date();
  return sprints.map((s) => {
    const done = s.tickets.filter((t) => (DONE_STATES as string[]).includes(t.status));
    const perDev: Record<string, { name: string; points: number; tickets: number; hours: number }> = {};
    for (const t of s.tickets) {
      if (!t.assignee) continue;
      const row = (perDev[t.assignee.id] ||= { name: t.assignee.name, points: 0, tickets: 0, hours: 0 });
      row.hours += hours(sumEntries(t.timeEntries, now));
      if ((DONE_STATES as string[]).includes(t.status)) { row.points += t.storyPoints ?? 0; row.tickets++; }
    }
    return {
      id: s.id, name: s.name, state: s.state,
      committed: s.tickets.reduce((a, t) => a + (t.storyPoints ?? 0), 0),
      completed: done.reduce((a, t) => a + (t.storyPoints ?? 0), 0),
      tickets: s.tickets.length, doneTickets: done.length,
      cycleDays: avgCycleDays(done), perDev,
    };
  });
}

export async function historyForEstimation() {
  const done = await db.ticket.findMany({ where: { status: { in: ["DONE", "DEPLOYED_PROD"] } }, include: { timeEntries: true } });
  return done.map((t) => ({ type: t.type as string, points: t.storyPoints, estimateHrs: t.estimateHrs, actualHrs: hours(sumEntries(t.timeEntries)) }));
}

export async function estimateAccuracy() {
  const h = await historyForEstimation();
  const rows = h.map((x) => accuracy(x.estimateHrs, x.actualHrs)).filter((x): x is number => x != null);
  const avg = rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : 0;
  return { avg, n: rows.length, within25: rows.filter((r) => r >= 0.75 && r <= 1.25).length };
}

export async function dwellByColumn() {
  const [tr, tickets] = await Promise.all([db.transition.findMany({ select: { ticketId: true, from: true, to: true, at: true } }), db.ticket.findMany({ select: { id: true, createdAt: true } })]);
  const { columnDwell } = await import("./analytics");
  return columnDwell(tr, Object.fromEntries(tickets.map((t) => [t.id, t.createdAt])));
}

export async function developerStats(devId?: string) {
  const now = new Date();
  const devs = await db.developer.findMany({ where: devId ? { id: devId } : {}, orderBy: { name: "asc" }, include: { tickets: { include: { timeEntries: true } }, sessions: true } });
  const since = new Date(now.getTime() - 14 * DAY);
  return devs.map((d) => {
    const done = d.tickets.filter((t) => (DONE_STATES as string[]).includes(t.status));
    const active = d.tickets.filter((t) => ["IN_PROGRESS", "INITIAL_REVIEW", "REVIEW", "FAILED_STG"].includes(t.status));
    const worked = hours(sumEntries(d.sessions.filter((s) => s.startedAt >= since), now));
    const tracked = hours(sumEntries(d.tickets.flatMap((t) => t.timeEntries).filter((e) => e.startedAt >= since && e.developerId === d.id), now));
    const acc = done.map((t) => accuracy(t.estimateHrs, hours(sumEntries(t.timeEntries)))).filter((x): x is number => x != null);
    return {
      d, donePoints: done.reduce((a, t) => a + (t.storyPoints ?? 0), 0), doneCount: done.length, active, worked, tracked,
      cycleDays: avgCycleDays(done), accuracy: acc.length ? acc.reduce((a, b) => a + b, 0) / acc.length : null,
      bugs: done.filter((t) => t.type === "BUG").length, failedStg: d.tickets.filter((t) => t.status === "FAILED_STG").length,
    };
  });
}
