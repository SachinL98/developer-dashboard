import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { SprintPlanner, type PlanTicket } from "@/components/SprintPlanner";
import { sprintFit } from "@/lib/estimation";
import { activeSprint } from "@/lib/queries";
import { jiraReady } from "@/lib/integrations/jira";
import { requireUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { SyncButtons } from "@/components/SyncButtons";

const FLOW = ["Collect bugs / features", "Create Jira tickets", "Prioritise in sprint plan", "Create sprint", "Groom complicated cards", "Rough estimates", "Finalise scope", "Start sprint"];

export default async function Sprints({ searchParams }: { searchParams: Promise<{ sprint?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const canManage = atLeast(me.access, "LEAD");
  const sprints = await db.sprint.findMany({ orderBy: { startDate: "asc" } });
  const open = sprints.filter((s) => s.state !== "CLOSED");
  const selected = sp.sprint ? sprints.find((s) => s.id === sp.sprint) : (open.find((s) => s.state === "PLANNING") ?? (await activeSprint()));
  const toPlan = (t: any): PlanTicket => ({ id: t.id, key: t.key, title: t.title, type: t.type, priority: t.priority, points: t.storyPoints, estimateHrs: t.estimateHrs, complicated: t.complicated, project: t.project.key, assignee: t.assignee?.name ?? null });
  const [backlog, inSprint, devs] = await Promise.all([
    db.ticket.findMany({ where: { sprintId: null, status: "BACKLOG" }, orderBy: { rank: "asc" }, include: { project: true, assignee: true } }),
    selected ? db.ticket.findMany({ where: { sprintId: selected.id }, orderBy: { rank: "asc" }, include: { project: true, assignee: true } }) : [],
    db.developer.findMany({ where: { role: { not: "Engineering Manager" } } }),
  ]);
  const weeks = selected ? Math.max(1, Math.round((selected.endDate.getTime() - selected.startDate.getTime()) / (7 * 86_400_000))) : 2;
  const capacity = devs.reduce((a, d) => a + d.capacityHrs * weeks, 0);
  const fit = selected ? sprintFit(capacity, inSprint.map((t) => t.estimateHrs)) : null;
  const perDev = devs.map((d) => ({ name: d.name, hrs: Math.round(inSprint.filter((t) => t.assigneeId === d.id).reduce((a, t) => a + (t.estimateHrs ?? 0), 0)), cap: Math.round(d.capacityHrs * weeks * 0.85) }));
  return (
    <div>
      <PageHeader title="Sprint planner" sub="Prioritise the backlog, fit it to capacity, then start the sprint." actions={<SyncButtons what="jira" disabled={!canManage || !(await jiraReady())} />} />
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {FLOW.map((f, i) => <div key={f} className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-mute"><span className="grid h-4 w-4 place-items-center rounded-full bg-line font-mono text-[10px] text-ink">{i + 1}</span>{f}</div>)}
      </div>
      <SprintPlanner
        sprints={sprints.slice().reverse().slice(0, 6).map((s) => ({ id: s.id, name: s.name, goal: s.goal, state: s.state, start: s.startDate.toISOString(), end: s.endDate.toISOString() }))}
        selected={selected ? { id: selected.id, name: selected.name, goal: selected.goal, state: selected.state, start: selected.startDate.toISOString(), end: selected.endDate.toISOString() } : null}
        backlog={backlog.map(toPlan)} inSprint={inSprint.map(toPlan)} fit={fit} perDev={perDev} canManage={canManage} />
    </div>
  );
}
