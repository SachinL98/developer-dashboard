import Link from "next/link";
import { db } from "@/lib/db";
import { activeSprint } from "@/lib/queries";
import { Board, type BoardTicket } from "@/components/Board";
import { PageHeader } from "@/components/ui";
import { sumEntries } from "@/lib/analytics";
import { hours } from "@/lib/time";
import { requireUser } from "@/lib/auth/session";
import { cachedBoardInfo, jiraBrowseUrl, jiraReady, loadStatusMap } from "@/lib/integrations/jira";
import { columnIdFor, jiraColumns, workflowColumns } from "@/lib/board-columns";
import { LiveSync } from "@/components/LiveSync";
import { getSetting } from "@/lib/settings";
import type { StatusKey } from "@/lib/workflow";

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ sprint?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const sprints = await db.sprint.findMany({ orderBy: { startDate: "desc" }, take: 8 });
  const current = sp.sprint ? sprints.find((s) => s.id === sp.sprint) : await activeSprint();
  const tickets = await db.ticket.findMany({
    where: current ? { sprintId: current.id } : {}, orderBy: { rank: "asc" },
    include: { assignee: true, project: true, timeEntries: true, reviews: { where: { kind: "INITIAL_CLAUDE" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  // With Jira connected the board shows the team's real Jira columns; otherwise the 10 workflow columns.
  const live = await jiraReady();
  const info = live ? await cachedBoardInfo() : null;
  const columns = info ? jiraColumns(info, await loadStatusMap()) : workflowColumns();
  const site = live ? (await jiraBrowseUrl("X"))?.replace(/\/browse\/X$/, "") ?? null : null;
  const lastSync = await getSetting<string>("jira.lastSync");
  const data: BoardTicket[] = tickets.map((t) => ({
    columnId: columnIdFor({ status: t.status as StatusKey, jiraStatus: t.jiraStatus }, columns), jiraStatus: t.jiraStatus, labels: t.labels,
    review: !t.reviews[0] ? "none" : t.reviews[0].status === "RUNNING" ? "running" : t.reviews[0].status === "ERROR" ? "error" : t.reviews[0].passed ? "passed" : "blocked",
    jiraUrl: site && t.jiraKey ? `${site}/browse/${t.jiraKey}` : null,
    id: t.id, key: t.key, title: t.title, status: t.status, type: t.type, priority: t.priority, points: t.storyPoints, estimateHrs: t.estimateHrs,
    loggedHrs: hours(sumEntries(t.timeEntries)), progressPct: t.progressPct, prNumber: t.prNumber, prState: t.prState,
    assigneeId: t.assigneeId, assignee: t.assignee ? { name: t.assignee.name, hue: t.assignee.avatarHue } : null, project: { key: t.project.key, color: t.project.color }, complicated: t.complicated,
  }));
  return (
    <div>
      <PageHeader title="Sprint board" sub={current ? `${current.name} · ${current.goal ?? ""}` : "All tickets"}
        actions={<><div className="flex gap-1 rounded-lg border border-line bg-panel p-1">{sprints.slice(0, 4).map((s) => (
          <Link key={s.id} href={`/board?sprint=${s.id}`} className={`rounded-md px-2.5 py-1 text-xs ${s.id === current?.id ? "bg-line text-white" : "text-mute hover:text-ink"}`}>{s.name}</Link>))}</div>
          <LiveSync enabled={live} lastSync={lastSync} /><Link href="/tickets/new" className="btn-primary">New ticket</Link></>} />
      {live && !info && <div className="mb-4 rounded-lg border border-neon-amber/40 bg-neon-amber/10 px-4 py-2 text-sm text-neon-amber">Jira is connected but the real board hasn't been read yet. A lead can press <Link href="/settings" className="underline">Sync Jira</Link> to load its columns.</div>}
      <Board key={`${current?.id ?? "all"}:${columns.map((c) => c.id).join("|")}`} tickets={data} columns={columns} actor={{ id: me.id, access: me.access }} />
    </div>
  );
}
