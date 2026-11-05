import { db } from "./db";
import { getSetting, setSetting } from "./settings";
import { getWorkspace } from "./config";
import { DONE_STATES } from "./workflow";
import { accuracy, sumEntries } from "./analytics";
import { hours, zonedParts } from "./time";
import { fillFor } from "./report-plan";
import { capacityDevs, teamAvailability } from "./leave";
import { localDate } from "./time";
import { addDays } from "./capacity";
import { buildSlides, previousPeriod, resolvePeriod, type CarryRow, type DevRow, type DeliveredRow, type Period, type PeriodStats, type ReportFacts, type ReportKind, type SprintLite } from "./report";

const DAY = 86_400_000;
const isDone = (s: string) => (DONE_STATES as string[]).includes(s);
const IN_FLIGHT = ["IN_PROGRESS", "INITIAL_REVIEW", "REVIEW", "DEPLOYED_STG", "FAILED_STG", "DOCUMENTED"];
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const notesKey = (periodKey: string) => `report.notes:${periodKey}`;
export const getReportNotes = async (periodKey: string) => (await getSetting<Record<string, string>>(notesKey(periodKey))) ?? {};
export async function saveReportNote(periodKey: string, slideId: string, text: string) {
  const cur = await getReportNotes(periodKey);
  const next = { ...cur };
  if (text.trim()) next[slideId] = text.trim().slice(0, 600); else delete next[slideId];
  await setSetting(notesKey(periodKey), next);
}

type TicketRow = Awaited<ReturnType<typeof fetchTickets>>[number];
const fetchTickets = (where: object) => db.ticket.findMany({ where, include: { assignee: true, project: true, timeEntries: true } });

async function statsFor(p: Period, now: Date): Promise<{ stats: PeriodStats; delivered: TicketRow[]; committed: number | null }> {
  const bySprint = p.sprintId != null;
  const delivered = (await fetchTickets(bySprint ? { sprintId: p.sprintId } : { doneAt: { gte: p.start, lt: p.end } }))
    .filter((t) => isDone(t.status));
  const committed = bySprint ? (await db.ticket.aggregate({ where: { sprintId: p.sprintId }, _sum: { storyPoints: true } }))._sum.storyPoints ?? 0 : null;
  const [entries, bugsOpened, deploys, fails] = await Promise.all([
    db.timeEntry.findMany({ where: { startedAt: { gte: p.start, lt: p.end } } }),
    db.ticket.count({ where: { type: "BUG", createdAt: { gte: p.start, lt: p.end } } }),
    db.transition.count({ where: { to: "DEPLOYED_STG", at: { gte: p.start, lt: p.end } } }),
    db.transition.count({ where: { to: "FAILED_STG", at: { gte: p.start, lt: p.end } } }),
  ]);
  const cyc = delivered.filter((t) => t.startedAt && t.doneAt).map((t) => (t.doneAt!.getTime() - t.startedAt!.getTime()) / DAY);
  return {
    delivered, committed,
    stats: {
      points: delivered.reduce((a, t) => a + (t.storyPoints ?? 0), 0), tickets: delivered.length, loggedHrs: hours(sumEntries(entries, now)),
      bugsFixed: delivered.filter((t) => t.type === "BUG").length, bugsOpened, stgDeploys: deploys, stgFailures: fails, cycleDays: avg(cyc),
    },
  };
}

export async function loadReport(kind: ReportKind, ref?: string, now = new Date()) {
  const cfg = await getWorkspace(); // applies the team timezone
  const tz = cfg.timezone;
  const sprintRows = await db.sprint.findMany({ orderBy: { startDate: "asc" } });
  const sprints: SprintLite[] = sprintRows;
  const period = resolvePeriod(kind, ref, now, sprints, tz);
  if (!period) return null;
  const prevP = previousPeriod(period, now, sprints, tz);
  const [cur, prev] = await Promise.all([statsFor(period, now), prevP ? statsFor(prevP, now) : null]);

  // Delivery / hours buckets (days for week and sprint, weeks for month).
  const entries = await db.timeEntry.findMany({ where: { startedAt: { gte: period.start, lt: period.end } }, select: { startedAt: true, endedAt: true } });
  const weekly = kind === "month";
  const step = weekly ? 7 * DAY : DAY;
  const n = Math.max(1, Math.ceil((period.end.getTime() - period.start.getTime()) / step));
  const buckets = Array.from({ length: n }, (_, i) => {
    const a = period.start.getTime() + i * step, b = a + step;
    const d = new Date(a);
    return {
      label: weekly ? `Wk of ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: tz })}` : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: tz }),
      points: cur.delivered.filter((t) => t.doneAt && t.doneAt.getTime() >= a && t.doneAt.getTime() < b).reduce((s, t) => s + (t.storyPoints ?? 0), 0),
      hours: Math.round(hours(sumEntries(entries.filter((e) => e.startedAt.getTime() >= a && e.startedAt.getTime() < b), now)) * 10) / 10,
    };
  });

  // Velocity of the last closed sprints up to this period.
  const upTo = kind === "sprint" ? period.end : period.end;
  const vSprints = sprintRows.filter((s) => (s.state === "CLOSED" || s.state === "ACTIVE") && s.startDate.getTime() < upTo.getTime()).slice(-6);
  const vTickets = await db.ticket.findMany({ where: { sprintId: { in: vSprints.map((s) => s.id) } }, select: { sprintId: true, status: true, storyPoints: true } });
  const velocity = vSprints.map((s) => {
    const ts = vTickets.filter((t) => t.sprintId === s.id);
    return { name: s.name, committed: ts.reduce((a, t) => a + (t.storyPoints ?? 0), 0), completed: ts.filter((t) => isDone(t.status)).reduce((a, t) => a + (t.storyPoints ?? 0), 0) };
  });

  const delivered: DeliveredRow[] = [...cur.delivered].sort((a, b) => (b.storyPoints ?? 0) - (a.storyPoints ?? 0)).map((t) => ({
    key: t.key, title: t.title, type: t.type, points: t.storyPoints ?? 0, hours: Math.round(hours(sumEntries(t.timeEntries, now)) * 10) / 10, assignee: t.assignee?.name ?? null, project: t.project.key }));

  const devMap = new Map<string, { name: string; pts: number; n: number; bugs: number; cyc: number[] }>();
  for (const t of cur.delivered) {
    const k = t.assignee?.name ?? "Unassigned";
    const row = devMap.get(k) ?? { name: k, pts: 0, n: 0, bugs: 0, cyc: [] };
    row.pts += t.storyPoints ?? 0; row.n++; if (t.type === "BUG") row.bugs++;
    if (t.startedAt && t.doneAt) row.cyc.push((t.doneAt.getTime() - t.startedAt.getTime()) / DAY);
    devMap.set(k, row);
  }
  const devEntries = await db.timeEntry.findMany({ where: { startedAt: { gte: period.start, lt: period.end } }, include: { developer: true } });
  const devHours = new Map<string, number>();
  for (const e of devEntries) devHours.set(e.developer.name, (devHours.get(e.developer.name) ?? 0) + hours(sumEntries([e], now)));
  for (const name of devHours.keys()) if (!devMap.has(name)) devMap.set(name, { name, pts: 0, n: 0, bugs: 0, cyc: [] });
  const devs: DevRow[] = [...devMap.values()].map((d) => ({ name: d.name, points: d.pts, tickets: d.n, bugs: d.bugs, hours: devHours.get(d.name) ?? 0, cycleDays: avg(d.cyc) }))
    .sort((a, b) => b.points - a.points || b.hours - a.hours);

  // Carry-over: unfinished sprint cards for a sprint report, otherwise everything in flight now.
  const open = kind === "sprint"
    ? await fetchTickets({ sprintId: period.sprintId, status: { notIn: DONE_STATES } })
    : await fetchTickets({ status: { in: IN_FLIGHT } });
  const toCarry = (t: TicketRow): CarryRow => ({ key: t.key, title: t.title, status: t.status, assignee: t.assignee?.name ?? null, points: t.storyPoints ?? 0 });
  const carry = open.map(toCarry);
  const weekAgo = now.getTime() - 7 * DAY;
  const stale = (await fetchTickets({ status: "IN_PROGRESS", updatedAt: { lt: new Date(weekAgo) } })).map(toCarry);
  const blockedIds = await db.ticket.findMany({ where: { status: "INITIAL_REVIEW" }, select: { id: true, reviews: { where: { kind: "INITIAL_CLAUDE" }, orderBy: { createdAt: "desc" }, take: 1, select: { passed: true, status: true } } } });
  const reviewBlocked = blockedIds.filter((t) => !t.reviews[0] || t.reviews[0].status !== "DONE" || !t.reviews[0].passed).length;

  const acc = cur.delivered.map((t) => accuracy(t.estimateHrs, hours(sumEntries(t.timeEntries, now)))).filter((x): x is number => x != null);

  const meetings = await db.meeting.findMany({ where: { startsAt: { gte: period.start, lt: period.end } }, include: { actionItems: true } });
  const decisions = [...new Set(meetings.flatMap((m) => m.decisions))];
  const seen = new Set<string>();
  const openActions = (await db.actionItem.findMany({ where: { done: false }, orderBy: { id: "desc" }, take: 30 })).map((a) => ({ text: a.text, owner: a.owner }))
    .filter((a) => { const k = `${a.text}|${a.owner}`; return seen.has(k) ? false : (seen.add(k), true); });

  const plan = await fillFor(cfg, now, tz);
  const lr = { start: localDate(period.start), end: localDate(new Date(period.end.getTime() - DAY)) };
  const ta = await teamAvailability(await capacityDevs(), lr.start, lr.end);
  const leave = { days: ta.leaveDays, holidays: ta.perDev[0]?.av.holidayDays ?? 0 };
  void addDays;
  const notes = await getReportNotes(period.key);
  const facts: ReportFacts = {
    period, now, tz, stats: cur.stats, prev: prev?.stats ?? null, prevLabel: prevP?.label ?? null, committedPts: cur.committed,
    buckets, bucketUnit: weekly ? "week" : "day", velocity, delivered, devs, carry, estimateAccuracy: acc.length ? { avg: avg(acc)!, n: acc.length } : null,
    stale, reviewBlocked, decisions, openActions, nextSprint: plan.nextSprint, nextMonth: plan.nextMonth, leave, notes,
  };
  void zonedParts;
  return { facts, slides: buildSlides(facts) };
}

/** Selectable periods for the picker: last 8 weeks, all sprints, last 6 months. */
export async function periodOptions(now = new Date()) {
  const cfg = await getWorkspace();
  const sprints = await db.sprint.findMany({ orderBy: { startDate: "desc" }, take: 10 });
  const out: Record<ReportKind, { ref: string; label: string }[]> = { week: [], sprint: sprints.map((s) => ({ ref: s.id, label: `${s.name} (${s.state.toLowerCase()})` })), month: [] };
  let wk = resolvePeriod("week", undefined, now, [], cfg.timezone)!;
  for (let i = 0; i < 8; i++) { out.week.push({ ref: wk.key.slice(5), label: wk.label }); wk = previousPeriod(wk, now, [], cfg.timezone)!; }
  let mo = resolvePeriod("month", undefined, now, [], cfg.timezone)!;
  for (let i = 0; i < 6; i++) { out.month.push({ ref: mo.key.slice(6), label: mo.label }); mo = previousPeriod(mo, now, [], cfg.timezone)!; }
  return out;
}
