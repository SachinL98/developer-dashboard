import { fg } from "@/lib/theme";
import Link from "next/link";
import { db } from "@/lib/db";
import { activeSprint, sprintSnapshot, DAY } from "@/lib/queries";
import { Kpi, PageHeader, Avatar, Progress, StatusBadge, Empty } from "@/components/ui";
import { BurndownChart, StatusBars } from "@/components/Charts";
import { STATUS_META, STATUS_ORDER } from "@/lib/workflow";
import { fmtDay, fmtDur, fmtTime } from "@/lib/time";
import { sumEntries } from "@/lib/analytics";
import { Video, AlertTriangle, Radio } from "lucide-react";

export default async function Overview() {
  const sprint = await activeSprint();
  if (!sprint) return <Empty>No sprint yet. Create one in <Link className="text-neon underline" href="/sprints">Sprints</Link>.</Empty>;
  const snap = await sprintSnapshot(sprint.id);
  const now = new Date();
  const dayStart = new Date(now.getTime() - 12 * 3600_000);
  const [live, meetings, recent, devs] = await Promise.all([
    db.workSession.findMany({ where: { endedAt: null }, include: { developer: true } }),
    db.meeting.findMany({ where: { startsAt: { gte: new Date(now.getTime() - 3600_000), lte: new Date(now.getTime() + 2 * DAY) } }, orderBy: { startsAt: "asc" }, take: 5 }),
    db.transition.findMany({ orderBy: { at: "desc" }, take: 8, include: { ticket: true, by: true } }),
    db.developer.findMany({ include: { timers: { where: { endedAt: null }, include: { ticket: true } } } }),
  ]);
  const todayEntries = await db.timeEntry.findMany({ where: { startedAt: { gte: dayStart } } });
  const stale = snap.tickets.filter((t) => t.status === "IN_PROGRESS" && t.timeEntries.every((e) => (e.endedAt ?? now).getTime() < now.getTime() - 2 * DAY));
  const failed = snap.tickets.filter((t) => t.status === "FAILED_STG");
  const waiting = snap.tickets.filter((t) => ["INITIAL_REVIEW", "REVIEW"].includes(t.status));
  const burn = snap.burn.map((r) => ({ day: r.day, ideal: r.idealPts, actual: r.actualPts }));
  const statusData = STATUS_ORDER.map((s) => ({ name: STATUS_META[s].label, value: snap.byStatus[s], color: STATUS_META[s].color }));
  const pace = snap.points ? (snap.donePts / snap.points) * 100 : 0;
  const health = pace + 8 >= snap.elapsedPct ? ["On track", "#a3e635"] : pace + 25 >= snap.elapsedPct ? ["At risk", "#fbbf24"] : ["Behind", "#fb7185"];

  return (
    <div className="space-y-6">
      <PageHeader title={sprint.name} sub={<>{sprint.goal} · {fmtDay(sprint.startDate)} → {fmtDay(sprint.endDate)} · <span style={{ color: fg(health[1]) }}>{health[0]}</span></>}
        actions={<><Link href="/tickets/new" className="btn">New ticket</Link><Link href="/board" className="btn-primary">Open board</Link></>} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Kpi label="Days left" value={snap.daysLeft} sub={`of ${snap.totalDays} · ${Math.round(snap.elapsedPct)}% elapsed`} accent="#6ee7ff" />
        <Kpi label="Points done" value={<>{snap.donePts}<span className="text-lg text-mute">/{snap.points}</span></>} sub={`${Math.round(pace)}% complete`} accent="#a3e635" />
        <Kpi label="Hours logged" value={Math.round(snap.loggedHrs)} sub={`vs ${Math.round(snap.estHrs)}h estimated`} accent="#a78bfa" />
        <Kpi label="Waiting on review" value={waiting.length} sub="Initial review + Review" accent="#fbbf24" />
        <Kpi label="Failed in staging" value={failed.length} sub={failed.length ? "Needs rework" : "All clear"} accent="#fb7185" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="card-pad xl:col-span-2">
          <div className="mb-2 flex items-center justify-between"><span className="h-section">Burndown (story points)</span><Link href="/analytics" className="text-xs text-neon">All analytics →</Link></div>
          <BurndownChart data={burn} />
        </div>
        <div className="card-pad">
          <div className="mb-2 h-section">Cards by column</div>
          <StatusBars data={statusData} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="card-pad">
          <div className="mb-3 flex items-center gap-2 h-section"><Radio size={14} className="text-neon-lime" /> Working now</div>
          <div className="space-y-3">
            {devs.map((d) => {
              const s = live.find((l) => l.developerId === d.id);
              const timer = d.timers[0];
              const today = sumEntries(todayEntries.filter((e) => e.developerId === d.id), now);
              return (
                <div key={d.id} className="flex items-center gap-3">
                  <div className="relative"><Avatar name={d.name} hue={d.avatarHue} />{s && <span className="live-dot absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel bg-neon-lime" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{d.name}</div>
                    <div className="truncate text-xs text-mute">{timer ? <><span className="font-mono text-neon-violet">{timer.ticket.key}</span> {timer.ticket.title}</> : s ? `On the clock since ${fmtTime(s.startedAt)}` : "Offline"}</div>
                  </div>
                  <div className="font-mono text-xs text-mute">{fmtDur(today)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-pad">
          <div className="mb-3 flex items-center gap-2 h-section"><Video size={14} className="text-neon" /> Upcoming meetings</div>
          {meetings.length ? <div className="space-y-2">{meetings.map((m) => (
            <Link href={`/meetings#${m.id}`} key={m.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm transition hover:border-neon/40">
              <div><div>{m.title}</div><div className="text-xs text-mute">{fmtDay(m.startsAt)} · {fmtTime(m.startsAt)}–{fmtTime(m.endsAt)}</div></div>
              {m.meetUrl && <span className="chip text-neon">Meet</span>}
            </Link>))}</div> : <Empty>Nothing in the next 2 days.</Empty>}
        </div>

        <div className="card-pad">
          <div className="mb-3 flex items-center gap-2 h-section"><AlertTriangle size={14} className="text-neon-amber" /> Needs attention</div>
          <ul className="space-y-2 text-sm">
            {failed.map((t) => <li key={t.id}><Link href={`/tickets/${t.id}`} className="flex items-start gap-2 hover:text-ink"><StatusBadge status="FAILED_STG" /><span className="min-w-0 truncate"><span className="font-mono text-mute">{t.key}</span> {t.title}</span></Link></li>)}
            {waiting.slice(0, 4).map((t) => <li key={t.id}><Link href={`/tickets/${t.id}`} className="flex items-start gap-2 hover:text-ink"><StatusBadge status={t.status} /><span className="min-w-0 truncate"><span className="font-mono text-mute">{t.key}</span> {t.title}</span></Link></li>)}
            {stale.map((t) => <li key={t.id} className="text-xs text-neon-amber">⏱ {t.key} has no tracked time for 2+ days</li>)}
            {!failed.length && !waiting.length && !stale.length && <li className="text-mute">Nothing blocked. Nice.</li>}
          </ul>
        </div>
      </div>

      <div className="card-pad">
        <div className="mb-3 h-section">Recent card movement</div>
        <div className="grid gap-2 md:grid-cols-2">
          {recent.map((r) => (
            <Link key={r.id} href={`/tickets/${r.ticketId}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-panel2">
              <span className="font-mono text-xs text-mute">{r.ticket.key}</span>
              <span className="min-w-0 flex-1 truncate">{r.ticket.title}</span>
              <StatusBadge status={r.to} />
            </Link>
          ))}
        </div>
      </div>
      <Progress pct={0} className="hidden" />
    </div>
  );
}
