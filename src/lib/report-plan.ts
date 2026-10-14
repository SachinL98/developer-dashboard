import { db } from "./db";
import { zonedParts } from "./time";
import type { WorkspaceConfig } from "./config";
import type { MonthPlan, PlanRow, SprintPlan } from "./report";

const row = (t: { key: string; title: string; priority: string; storyPoints: number | null; estimateHrs: number | null; assignee: { name: string } | null }): PlanRow =>
  ({ key: t.key, title: t.title, priority: t.priority, points: t.storyPoints, hours: t.estimateHrs, assignee: t.assignee?.name ?? null });

/** The plan for the next sprint (from the planner) and for the next four weeks (from the prioritised backlog). */
export async function fillFor(cfg: WorkspaceConfig, now: Date, tz: string): Promise<{ nextSprint: SprintPlan | null; nextMonth: MonthPlan }> {
  const devs = await db.developer.findMany({ where: { active: true }, select: { capacityHrs: true } });
  const weekly = devs.reduce((a, d) => a + d.capacityHrs, 0);
  const usable = (weeks: number) => Math.round(weekly * weeks * (1 - cfg.bufferPct / 100) * 10) / 10;

  const upcoming = await db.sprint.findFirst({ where: { state: "PLANNING" }, orderBy: { startDate: "asc" } });
  let nextSprint: SprintPlan | null = null;
  if (upcoming) {
    const tickets = await db.ticket.findMany({ where: { sprintId: upcoming.id }, orderBy: { rank: "asc" }, include: { assignee: true } });
    const weeks = Math.max(1, (upcoming.endDate.getTime() - upcoming.startDate.getTime() + 86_400_000) / (7 * 86_400_000));
    const capacityHrs = usable(weeks);
    const committedHrs = tickets.reduce((a, t) => a + (t.estimateHrs ?? 0), 0);
    nextSprint = {
      name: upcoming.name, goal: upcoming.goal, start: upcoming.startDate, end: upcoming.endDate, state: upcoming.state, rows: tickets.map(row),
      committedHrs, capacityHrs, loadPct: capacityHrs ? Math.round((committedHrs / capacityHrs) * 100) : 0,
      unestimated: tickets.filter((t) => t.estimateHrs == null && t.storyPoints == null).length, unassigned: tickets.filter((t) => !t.assigneeId).length,
    };
  }

  const backlog = await db.ticket.findMany({ where: { sprintId: null, status: { in: ["BACKLOG", "READY_TO_DEV"] } }, orderBy: { rank: "asc" }, include: { assignee: true } });
  const carry = await db.ticket.aggregate({ where: { status: { in: ["IN_PROGRESS", "INITIAL_REVIEW", "REVIEW", "DEPLOYED_STG", "FAILED_STG", "DOCUMENTED"] } }, _sum: { storyPoints: true } });
  const capacityHrs = usable(4);
  const inFlightHrs = (await db.ticket.aggregate({ where: { status: { in: ["IN_PROGRESS", "INITIAL_REVIEW", "REVIEW", "FAILED_STG"] } }, _sum: { estimateHrs: true } }))._sum.estimateHrs ?? 0;
  let room = Math.max(0, capacityHrs - (nextSprint?.committedHrs ?? 0) - inFlightHrs), plannedHrs = 0, plannedPts = 0;
  const candidates: PlanRow[] = [];
  for (const t of backlog) {
    if (t.estimateHrs == null || t.estimateHrs > room) continue;
    room -= t.estimateHrs; plannedHrs += t.estimateHrs; plannedPts += t.storyPoints ?? 0; candidates.push(row(t));
  }
  const z = zonedParts(now, tz);
  const label = new Date(Date.UTC(z.y, z.m, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return { nextSprint, nextMonth: { label, capacityHrs, candidates, plannedHrs: Math.round(plannedHrs * 10) / 10, plannedPts, backlogCount: backlog.length, carryPts: carry._sum.storyPoints ?? 0 } };
}
