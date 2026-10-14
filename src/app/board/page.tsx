import Link from "next/link";
import { db } from "@/lib/db";
import { activeSprint } from "@/lib/queries";
import { Board, type BoardTicket } from "@/components/Board";
import { PageHeader } from "@/components/ui";
import { sumEntries } from "@/lib/analytics";
import { hours } from "@/lib/time";

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ sprint?: string }> }) {
  const sp = await searchParams;
  const sprints = await db.sprint.findMany({ orderBy: { startDate: "desc" }, take: 8 });
  const current = sp.sprint ? sprints.find((s) => s.id === sp.sprint) : await activeSprint();
  const tickets = await db.ticket.findMany({
    where: current ? { sprintId: current.id } : {}, orderBy: { rank: "asc" },
    include: { assignee: true, project: true, timeEntries: true },
  });
  const data: BoardTicket[] = tickets.map((t) => ({
    id: t.id, key: t.key, title: t.title, status: t.status, type: t.type, priority: t.priority, points: t.storyPoints, estimateHrs: t.estimateHrs,
    loggedHrs: hours(sumEntries(t.timeEntries)), progressPct: t.progressPct, prNumber: t.prNumber, prState: t.prState,
    assignee: t.assignee ? { name: t.assignee.name, hue: t.assignee.avatarHue } : null, project: { key: t.project.key, color: t.project.color }, complicated: t.complicated,
  }));
  return (
    <div>
      <PageHeader title="Sprint board" sub={current ? `${current.name} · ${current.goal ?? ""}` : "All tickets"}
        actions={<><div className="flex gap-1 rounded-lg border border-line bg-panel p-1">{sprints.slice(0, 4).map((s) => (
          <Link key={s.id} href={`/board?sprint=${s.id}`} className={`rounded-md px-2.5 py-1 text-xs ${s.id === current?.id ? "bg-line text-white" : "text-mute hover:text-ink"}`}>{s.name}</Link>))}</div>
          <Link href="/tickets/new" className="btn-primary">New ticket</Link></>} />
      <Board key={current?.id ?? "all"} tickets={data} />
    </div>
  );
}
