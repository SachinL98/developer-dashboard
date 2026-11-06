import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { calibration } from "@/lib/delivery-rules";
import { PageHeader, Avatar, Kpi, StatusBadge } from "@/components/ui";
import { developerStats, DAY } from "@/lib/queries";
import { LineSeries } from "@/components/Charts";
import { hoursPerDay } from "@/lib/analytics";
import { fmtDay, fmtTime } from "@/lib/time";
import { requireUser } from "@/lib/auth/session";
import { atLeast, canViewDeveloper } from "@/lib/permissions";
import { aiKeyFor, latestInsight } from "@/lib/ai";
import { loadDoneTickets, type DevProfile } from "@/lib/insights";
import { profileStats } from "@/lib/insights-calc";
import { DevInsights } from "@/components/DevInsights";

export default async function Dev({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireUser();
  if (!canViewDeveloper(viewer, id)) notFound();
  const [s] = await developerStats(id);
  if (!s) notFound();
  const now = new Date();
  const sessions = await db.workSession.findMany({ where: { developerId: id, startedAt: { gte: new Date(now.getTime() - 21 * DAY) } }, orderBy: { startedAt: "asc" } });
  const per = hoursPerDay(sessions, now);
  const series = Object.entries(per).map(([name, v]) => ({ name: name.slice(5), hours: Math.round(v * 10) / 10 }));
  const avgStart = sessions.length ? sessions.reduce((a, x) => a + ((x.startedAt.getUTCHours() * 60 + x.startedAt.getUTCMinutes())), 0) / sessions.length : 0;
  const tickets = await db.ticket.findMany({ where: { assigneeId: id }, orderBy: { updatedAt: "desc" }, take: 12 });
  const doneTickets = await loadDoneTickets();
  const cal = calibration(doneTickets.filter((t) => t.assigneeId === id));
  const [stats, saved, ai] = await Promise.all([Promise.resolve(profileStats(id, doneTickets)), latestInsight("DEV_PROFILE", id), aiKeyFor(viewer.id)]);
  const profile = saved ? ({ ...(saved.content as any), stats } as DevProfile) : null;
  return (
    <div className="space-y-6">
      <PageHeader back={{ href: "/team", label: "People" }} title={s.d.name} sub={`${s.d.role} · ${s.d.email}`} actions={<div className="flex items-center gap-3"><Link href={`/reports?kind=oneonone&dev=${id}`} className="btn">1:1 report</Link><Avatar name={s.d.name} hue={s.d.avatarHue} id={s.d.id} ver={s.d.avatarVer} size={44} /></div>} />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Kpi label="Points done" value={s.donePoints} accent="#6ee7ff" /><Kpi label="Tickets done" value={s.doneCount} accent="#a3e635" />
        <Kpi label="Avg cycle" value={s.cycleDays ? `${s.cycleDays.toFixed(1)}d` : "—"} accent="#a78bfa" />
        <Kpi label="Estimate accuracy" value={s.accuracy ? `${Math.round(s.accuracy * 100)}%` : "—"} sub="actual ÷ estimate" accent="#fbbf24" />
        <Kpi label="Avg day start" value={sessions.length ? `${String(Math.floor(((avgStart + 330) % 1440) / 60)).padStart(2, "0")}:${String(Math.round((avgStart + 330) % 60)).padStart(2, "0")}` : "—"} sub="local time (UTC+5:30)" accent="#f472b6" />
      </div>
      <div className="card-pad">
        <h2 className="text-sm font-semibold">Estimates against reality</h2>
        <p className="mb-3 mt-1 text-xs text-mute">How long {viewer.id === id ? "your" : "their"} tickets took compared with the estimate, by story-point size. Above 1.0 means the work usually takes longer than estimated. It is meant to help plan better, not to judge.</p>
        {cal.rows.length ? (<>
          <div className="overflow-x-auto"><table className="tbl min-w-[420px]"><thead><tr><th>Points</th><th>Tickets</th><th>Avg estimate</th><th>Avg took</th><th>Took ÷ estimate</th></tr></thead>
            <tbody>{cal.rows.map((r) => <tr key={r.points}><td>{r.points}</td><td className="tabular-nums">{r.tickets}</td><td className="tabular-nums">{r.estimateHrs}h</td><td className="tabular-nums">{r.actualHrs}h</td><td className="tabular-nums">{r.ratio ?? "n/a"}</td></tr>)}</tbody></table></div>
          <p className="mt-3 text-sm">{cal.bias === "under" ? `Work here usually takes about ${Math.round(((cal.overall ?? 1) - 1) * 100)}% longer than estimated, so adding a little buffer to estimates would make plans more reliable.` : cal.bias === "over" ? "Estimates here tend to be generous: work usually finishes faster than estimated." : cal.bias === "balanced" ? "Estimates and actual time line up well. Nice calibration." : "A few more finished, estimated tickets are needed for a clear picture."}</p>
        </>) : <p className="text-sm text-mute">No finished tickets with both points, an estimate and logged time yet.</p>}
      </div>
      <DevInsights devId={id} name={s.d.name} stats={stats} profile={profile} ready={!!ai} canGenerate={viewer.id === id || atLeast(viewer.access, "LEAD")} />

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
