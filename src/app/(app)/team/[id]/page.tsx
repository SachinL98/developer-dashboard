import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader, Avatar, Kpi, StatusBadge } from "@/components/ui";
import { developerStats, DAY } from "@/lib/queries";
import { LineSeries } from "@/components/Charts";
import { hoursPerDay } from "@/lib/analytics";
import { fmtDay, fmtTime } from "@/lib/time";

export default async function Dev({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [s] = await developerStats(id);
  if (!s) notFound();
  const now = new Date();
  const sessions = await db.workSession.findMany({ where: { developerId: id, startedAt: { gte: new Date(now.getTime() - 21 * DAY) } }, orderBy: { startedAt: "asc" } });
  const per = hoursPerDay(sessions, now);
  const series = Object.entries(per).map(([name, v]) => ({ name: name.slice(5), hours: Math.round(v * 10) / 10 }));
  const avgStart = sessions.length ? sessions.reduce((a, x) => a + ((x.startedAt.getUTCHours() * 60 + x.startedAt.getUTCMinutes())), 0) / sessions.length : 0;
  const tickets = await db.ticket.findMany({ where: { assigneeId: id }, orderBy: { updatedAt: "desc" }, take: 12 });
  return (
    <div className="space-y-6">
      <PageHeader title={s.d.name} sub={`${s.d.role} · ${s.d.email}`} actions={<Avatar name={s.d.name} hue={s.d.avatarHue} size={44} />} />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Kpi label="Points done" value={s.donePoints} accent="#6ee7ff" /><Kpi label="Tickets done" value={s.doneCount} accent="#a3e635" />
        <Kpi label="Avg cycle" value={s.cycleDays ? `${s.cycleDays.toFixed(1)}d` : "—"} accent="#a78bfa" />
        <Kpi label="Estimate accuracy" value={s.accuracy ? `${Math.round(s.accuracy * 100)}%` : "—"} sub="actual ÷ estimate" accent="#fbbf24" />
        <Kpi label="Avg day start" value={sessions.length ? `${String(Math.floor(((avgStart + 330) % 1440) / 60)).padStart(2, "0")}:${String(Math.round((avgStart + 330) % 60)).padStart(2, "0")}` : "—"} sub="local time (UTC+5:30)" accent="#f472b6" />
      </div>
      <div className="card-pad"><div className="h-section mb-2">Hours per day</div><LineSeries data={series} lines={[{ key: "hours", color: "#6ee7ff", name: "Hours" }]} unit="h" /></div>
      <div className="card-pad">
        <div className="h-section mb-3">Recent tickets</div>
        <ul className="space-y-1.5">{tickets.map((t) => <li key={t.id}><Link href={`/tickets/${t.id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-panel2"><span className="font-mono text-xs text-mute">{t.key}</span><span className="flex-1 truncate">{t.title}</span><StatusBadge status={t.status} /></Link></li>)}</ul>
      </div>
      <div className="card-pad"><div className="h-section mb-3">Latest work days</div>
        <ul className="space-y-1 text-sm">{sessions.slice(-6).reverse().map((x) => <li key={x.id} className="flex justify-between text-mute"><span>{fmtDay(x.startedAt)}</span><span className="font-mono text-xs">{fmtTime(x.startedAt)} – {x.endedAt ? fmtTime(x.endedAt) : "now"}</span></li>)}</ul></div>
    </div>
  );
}
