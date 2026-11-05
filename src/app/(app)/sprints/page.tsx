import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { SprintPlanner, type PlanTicket } from "@/components/SprintPlanner";
import { sprintFit } from "@/lib/estimation";
import { activeSprint } from "@/lib/queries";
import { jiraReady } from "@/lib/integrations/jira";
import { requireUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { getWorkspace, nextSprintDefaults } from "@/lib/config";
import { SyncButtons } from "@/components/SyncButtons";
import { capacityDevs, sprintDates, teamAvailability } from "@/lib/leave";
import { forecastCards } from "@/lib/capacity";
import { localDate } from "@/lib/time";
import { sumEntries } from "@/lib/analytics";
import { hours as toHours } from "@/lib/time";
import { DONE_STATES } from "@/lib/workflow";

const FLOW = ["Collect bugs / features", "Create Jira tickets", "Prioritise in sprint plan", "Create sprint", "Groom complicated cards", "Rough estimates", "Finalise scope", "Start sprint"];

export default async function Sprints({ searchParams }: { searchParams: Promise<{ sprint?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const cfg = await getWorkspace();
  const canManage = atLeast(me.access, "LEAD");
  const sprints = await db.sprint.findMany({ orderBy: { startDate: "asc" } });
  const open = sprints.filter((s) => s.state !== "CLOSED");
  const selected = sp.sprint ? sprints.find((s) => s.id === sp.sprint) : (open.find((s) => s.state === "PLANNING") ?? (await activeSprint()));
  const toPlan = (t: any): PlanTicket => ({ id: t.id, key: t.key, title: t.title, type: t.type, priority: t.priority, points: t.storyPoints, estimateHrs: t.estimateHrs, complicated: t.complicated, project: t.project.key, assignee: t.assignee?.name ?? null });
  const [backlog, inSprint, devs] = await Promise.all([
    db.ticket.findMany({ where: { sprintId: null, status: "BACKLOG" }, orderBy: { rank: "asc" }, include: { project: true, assignee: true } }),
    selected ? db.ticket.findMany({ where: { sprintId: selected.id }, orderBy: { rank: "asc" }, include: { project: true, assignee: true, timeEntries: true } }) : [],
    capacityDevs(),
  ]);
  // Capacity comes from each developer's weekly hours minus approved leave and public holidays inside the sprint dates.
  const range = selected ? sprintDates(selected) : null;
  const team = range ? await teamAvailability(devs, range.start, range.end) : null;
  const fit = selected && team ? sprintFit(team.hours, inSprint.map((t) => t.estimateHrs), cfg.bufferPct) : null;
  const perDev = (team?.perDev ?? []).map((d) => ({ name: d.name, hrs: Math.round(inSprint.filter((t) => t.assigneeId === d.id).reduce((a, t) => a + (t.estimateHrs ?? 0), 0)), cap: Math.round(d.av.hours * (1 - cfg.bufferPct / 100)), leaveDays: d.av.leaveDays }));
  const now = new Date();
  const forecast = range && team && selected!.state !== "CLOSED"
    ? forecastCards(
      inSprint.filter((t) => !(DONE_STATES as string[]).includes(t.status)).map((t) => ({ id: t.id, assigneeId: t.assigneeId, remainingHrs: Math.max(0, (t.estimateHrs ?? 0) - toHours(sumEntries(t.timeEntries, now))) })),
      devs, [localDate(now), range.start].sort().at(-1)!, range.end, team.leaves, team.holidays)
    : [];
  const leaveInfo = team ? { lostHrs: team.lostHours, leaveDays: team.leaveDays, holidayDays: team.perDev[0]?.av.holidayDays ?? 0, fullHrs: team.fullHours } : null;
  return (
    <div>
      <PageHeader title="Sprint planner" sub="Prioritise the backlog, fit it to capacity, then start the sprint." actions={<SyncButtons what="jira" disabled={!canManage || !(await jiraReady())} />} />
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {FLOW.map((f, i) => <div key={f} className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-mute"><span className="grid h-4 w-4 place-items-center rounded-full bg-line font-mono text-[10px] text-ink">{i + 1}</span>{f}</div>)}
      </div>
      <SprintPlanner
        newSprint={nextSprintDefaults(sprints.at(-1)?.name ?? null, sprints.reduce<Date | null>((m, x) => (!m || x.endDate > m ? x.endDate : m), null), cfg)}
        sprints={sprints.slice().reverse().slice(0, 6).map((s) => ({ id: s.id, name: s.name, goal: s.goal, state: s.state, start: s.startDate.toISOString(), end: s.endDate.toISOString() }))}
        selected={selected ? { id: selected.id, name: selected.name, goal: selected.goal, state: selected.state, start: selected.startDate.toISOString(), end: selected.endDate.toISOString() } : null}
        backlog={backlog.map(toPlan)} inSprint={inSprint.map(toPlan)} fit={fit} perDev={perDev} leave={leaveInfo} forecast={Object.fromEntries(forecast.map((f) => [f.ticketId, { finish: f.finish, late: f.late }]))} canManage={canManage} />
    </div>
  );
}
