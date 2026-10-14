import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader, StatusBadge, TypeDot, PriorityTag, Avatar } from "@/components/ui";
import { STATUS_ORDER, type StatusKey } from "@/lib/workflow";

export default async function Tickets({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const tickets = await db.ticket.findMany({
    where: { ...(sp.status ? { status: sp.status as StatusKey } : {}), ...(sp.q ? { OR: [{ title: { contains: sp.q, mode: "insensitive" } }, { key: { contains: sp.q, mode: "insensitive" } }] } : {}) },
    include: { assignee: true, sprint: true }, orderBy: [{ updatedAt: "desc" }], take: 200,
  });
  return (
    <div>
      <PageHeader title="All tickets" sub={`${tickets.length} shown`} actions={<Link className="btn-primary" href="/tickets/new">New ticket</Link>} />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={sp.q} className="input max-w-xs" placeholder="Search…" />
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-[200px]"><option value="">All columns</option>{STATUS_ORDER.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ").toLowerCase()}</option>)}</select>
        <button className="btn">Filter</button></form>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-panel2 text-left text-xs uppercase tracking-wider text-mute"><tr><th className="p-3">Key</th><th>Title</th><th>Type</th><th>Priority</th><th>Status</th><th>Sprint</th><th>Pts</th><th className="pr-3">Owner</th></tr></thead>
          <tbody>{tickets.map((t) => (
            <tr key={t.id} className="border-t border-line/60 hover:bg-panel2/60">
              <td className="p-3 font-mono text-xs text-mute">{t.key}</td><td className="max-w-md truncate"><Link className="hover:text-neon" href={`/tickets/${t.id}`}>{t.title}</Link></td>
              <td><TypeDot type={t.type} /></td><td><PriorityTag p={t.priority} /></td><td><StatusBadge status={t.status} /></td><td className="text-xs text-mute">{t.sprint?.name ?? "—"}</td>
              <td className="font-mono text-xs">{t.storyPoints ?? "—"}</td><td className="pr-3">{t.assignee && <Avatar name={t.assignee.name} hue={t.assignee.avatarHue} size={22} />}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
