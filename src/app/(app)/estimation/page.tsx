import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { PageHeader, Kpi } from "@/components/ui";
import { EstimationBoard, type EstTicket } from "@/components/EstimationBoard";
import { suggestEstimate } from "@/lib/estimation";
import { activeSprint, estimateAccuracy, historyForEstimation } from "@/lib/queries";
import { cachedBoardInfo, jiraReady } from "@/lib/integrations/jira";
import Link from "next/link";

export default async function Estimation({ searchParams }: { searchParams: Promise<{ sprint?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const [history, acc, devCount] = await Promise.all([historyForEstimation(), estimateAccuracy(), db.developer.count({ where: { role: { not: "Engineering Manager" } } })]);
  const sprints = await db.sprint.findMany({ where: { state: { in: ["PLANNING", "ACTIVE"] } }, orderBy: { startDate: "asc" } });
  const backlog = sp.sprint === "backlog";
  const selected = backlog ? null : sprints.find((x) => x.id === sp.sprint) ?? (await activeSprint()) ?? sprints[0] ?? null;
  const tickets = await db.ticket.findMany({
    where: { ...(selected ? { sprintId: selected.id } : { sprintId: null, status: "BACKLOG" }), status: { notIn: ["DONE", "DEPLOYED_PROD"] } },
    include: { votes: { include: { developer: true } } }, orderBy: [{ estimateHrs: { sort: "asc", nulls: "first" } }, { complicated: "desc" }, { rank: "asc" }], take: 60,
  });
  const live = await jiraReady();
  const unit = live ? (await cachedBoardInfo())?.estimation ?? null : null;
  const data: EstTicket[] = tickets.map((t) => ({
    id: t.id, key: t.key, title: t.title, description: t.description, type: t.type, points: t.storyPoints, estimateHrs: t.estimateHrs, complicated: t.complicated,
    jira: !t.jiraKey ? "local" : t.estimateSyncError ? "error" : t.estimateSyncedAt ? "synced" : "pending", jiraError: t.estimateSyncError,
    suggestion: suggestEstimate({ type: t.type, points: t.storyPoints, complicated: t.complicated }, history),
    votes: t.votes.map((v) => ({ dev: v.developer.name, hours: v.hours, mine: v.developerId === me?.id })), myVote: t.votes.find((v) => v.developerId === me?.id)?.hours ?? null,
  }));
  return (
    <div className="space-y-6">
      <PageHeader title="Time estimation" sub="Monday 09:15–09:45 session: poker votes + suggestions learned from your finished tickets. Agreed estimates are written to the real Jira tickets."
        actions={<div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-panel p-1">{sprints.map((x) => (
          <Link key={x.id} href={`/estimation?sprint=${x.id}`} className={`rounded-md px-2.5 py-1 text-xs ${x.id === selected?.id ? "bg-line text-white" : "text-mute hover:text-ink"}`}>{x.name}</Link>))}
          <Link href="/estimation?sprint=backlog" className={`rounded-md px-2.5 py-1 text-xs ${!selected ? "bg-line text-white" : "text-mute hover:text-ink"}`}>Backlog</Link></div>} />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Needing estimates" value={data.filter((d) => d.estimateHrs == null).length} accent="#fbbf24" />
        <Kpi label="Estimate accuracy" value={acc.n ? `${Math.round(acc.avg * 100)}%` : "—"} sub={acc.avg > 1.05 ? "Team under-estimates (actual > estimate)" : acc.avg && acc.avg < 0.95 ? "Team over-estimates" : "Well calibrated"} accent="#6ee7ff" />
        <Kpi label="Within ±25%" value={acc.n ? `${Math.round((acc.within25 / acc.n) * 100)}%` : "—"} sub={`${acc.n} finished tickets`} accent="#a3e635" />
        <Kpi label="Training data" value={history.length} sub="finished tickets with time logs" accent="#a78bfa" />
      </div>
      <EstimationBoard tickets={data} devCount={devCount} canLead={atLeast(me.access, "LEAD")} sprintId={selected?.id ?? null} sprintName={selected?.name ?? "Backlog"} unit={unit ? { mode: unit.mode, field: unit.field } : null} jiraLive={live} />
    </div>
  );
}
