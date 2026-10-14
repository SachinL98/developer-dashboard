import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { PageHeader, Kpi } from "@/components/ui";
import { EstimationBoard, type EstTicket } from "@/components/EstimationBoard";
import { suggestEstimate } from "@/lib/estimation";
import { estimateAccuracy, historyForEstimation } from "@/lib/queries";

export default async function Estimation() {
  const me = await requireUser();
  const [history, acc, devCount] = await Promise.all([historyForEstimation(), estimateAccuracy(), db.developer.count({ where: { role: { not: "Engineering Manager" } } })]);
  const sprints = await db.sprint.findMany({ where: { state: { in: ["PLANNING", "ACTIVE"] } }, select: { id: true } });
  const tickets = await db.ticket.findMany({
    where: { OR: [{ sprintId: { in: sprints.map((s) => s.id) } }, { status: "BACKLOG" }], status: { notIn: ["DONE", "DEPLOYED_PROD"] } },
    include: { votes: { include: { developer: true } } }, orderBy: [{ estimateHrs: { sort: "asc", nulls: "first" } }, { complicated: "desc" }, { rank: "asc" }], take: 40,
  });
  const data: EstTicket[] = tickets.map((t) => ({
    id: t.id, key: t.key, title: t.title, description: t.description, type: t.type, points: t.storyPoints, estimateHrs: t.estimateHrs, complicated: t.complicated,
    suggestion: suggestEstimate({ type: t.type, points: t.storyPoints, complicated: t.complicated }, history),
    votes: t.votes.map((v) => ({ dev: v.developer.name, hours: v.hours, mine: v.developerId === me?.id })), myVote: t.votes.find((v) => v.developerId === me?.id)?.hours ?? null,
  }));
  return (
    <div className="space-y-6">
      <PageHeader title="Time estimation" sub="Monday 09:15–09:45 session: poker votes + suggestions learned from your finished tickets." />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Needing estimates" value={data.filter((d) => d.estimateHrs == null).length} accent="#fbbf24" />
        <Kpi label="Estimate accuracy" value={acc.n ? `${Math.round(acc.avg * 100)}%` : "—"} sub={acc.avg > 1.05 ? "Team under-estimates (actual > estimate)" : acc.avg && acc.avg < 0.95 ? "Team over-estimates" : "Well calibrated"} accent="#6ee7ff" />
        <Kpi label="Within ±25%" value={acc.n ? `${Math.round((acc.within25 / acc.n) * 100)}%` : "—"} sub={`${acc.n} finished tickets`} accent="#a3e635" />
        <Kpi label="Training data" value={history.length} sub="finished tickets with time logs" accent="#a78bfa" />
      </div>
      <EstimationBoard tickets={data} devCount={devCount} canLead={atLeast(me.access, "LEAD")} />
    </div>
  );
}
