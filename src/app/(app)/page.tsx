import { fg } from "@/lib/theme";
import Link from "next/link";
import { after } from "next/server";
import * as svc from "@/lib/services";
import { db } from "@/lib/db";
import { activeSprint, sprintSnapshot, DAY } from "@/lib/queries";
import { Kpi, PageHeader, Avatar, Progress, StatusBadge, Empty } from "@/components/ui";
import { BurndownChart, StatusBars } from "@/components/Charts";
import { STATUS_META, STATUS_ORDER } from "@/lib/workflow";
import { fmtDay, fmtDur, fmtTime } from "@/lib/time";
import { sumEntries, isDone } from "@/lib/analytics";
import { idleWorkdays } from "@/lib/pace";
import { localDate } from "@/lib/time";

export default async function Overview() {

  after(() => svc.processEndedMeetings().then(() => {}, () => {})); // notes for meetings that just ended, without anyone pressing a button
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
  // Idle = no time logged for 2+ working days. Weekends, public holidays and the assignee's approved leave don't count.
  const todayStr = localDate(now);
  const stale = snap.tickets.filter((t) => {
    if (t.status !== "IN_PROGRESS" || !t.assigneeId) return false;
    const last = t.timeEntries.reduce<Date | null>((m, e) => { const x = e.endedAt ?? now; return !m || x > m ? x : m; }, null) ?? t.startedAt ?? t.updatedAt;
    return idleWorkdays(localDate(last), todayStr, t.assigneeId, snap.leaves, snap.holidays) >= 2;
  });
  const failed = snap.tickets.filter((t) => t.status === "FAILED_STG");
  const waiting = snap.tickets.filter((t) => ["INITIAL_REVIEW", "REVIEW"].includes(t.status));
  const burn = snap.burn.map((r) => ({ day: r.day, ideal: r.idealPts, actual: r.actualPts }));
  const statusData = STATUS_ORDER.map((s) => ({ name: STATUS_META[s].label, value: snap.byStatus[s], color: STATUS_META[s].color }));
  // Progress is measured in tickets: it works for every board, including Jira projects that do not use story points.
  const doneCount = snap.tickets.filter((t) => isDone(t.status)).length;
  const pace = snap.tickets.length ? (doneCount / snap.tickets.length) * 100 : 0;
  const health = pace + 8 >= snap.elapsedPct ? ["On track", "#a3e635"] : pace + 25 >= snap.elapsedPct ? ["At risk", "#fbbf24"] : ["Behind", "#fb7185"];

  const rows = devs.map((d) => {
    const mine = snap.tickets.filter((t) => t.assigneeId === d.id);
    const done = mine.filter((t) => isDone(t.status));
    const wip = mine.filter((t) => !isDone(t.status) && !["BACKLOG", "READY_TO_DEV"].includes(t.status));
    const total = mine.length;
    const pts = mine.reduce((a, t) => a + (t.storyPoints ?? 0), 0);
    return { d, total, doneTickets: done.length, wipTickets: wip.length, pts, pct: total ? (done.length / total) * 100 : 0, wipPct: total ? (wip.length / total) * 100 : 0 };
  }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  const unassigned = snap.tickets.filter((t) => !t.assigneeId);
  const rowColor = (pct: number, expected: number) => (pct + 8 >= expected ? "#a3e635" : pct + 25 >= expected ? "#fbbf24" : "#fb7185");
  const paceOf = (id: string) => snap.pace.perDev[id] ?? { expectedPct: snap.elapsedPct, availableDays: 0, leaveDays: 0, leaveDaysLeft: 0, holidayDays: 0, awayToday: 0 };
  const leaveTotal = Object.values(snap.pace.perDev).reduce((a, p) => a + p.leaveDays, 0);

  return (
    <div className="space-y-6">
      <PageHeader title={sprint.name} sub={<>{sprint.goal} · {fmtDay(sprint.startDate)} → {fmtDay(sprint.endDate)} · <span style={{ color: fg(health[1]) }}>{health[0]}</span></>}
        actions={<><Link href="/tickets/new" className="btn">New ticket</Link><Link href="/board" className="btn-primary">Open board</Link></>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Working days left" value={snap.daysLeft} sub={`${Math.round(snap.elapsedPct)}% of available time used${leaveTotal ? ` · ${leaveTotal} leave day${leaveTotal === 1 ? "" : "s"} planned` : ""}`} accent="#2563eb" />
        <Kpi label="Tickets completed" value={<>{doneCount}<span className="text-lg font-normal text-mute"> / {snap.tickets.length}</span></>} sub={`${Math.round(pace)}% of the sprint${snap.usePoints ? ` · ${snap.donePts} of ${snap.points} points` : ""}`} accent="#16a34a" />
        <Kpi label="Hours logged" value={Math.round(snap.loggedHrs)} sub={`of ${Math.round(snap.estHrs)}h estimated`} accent="#4f46e5" />
        <Kpi label="Needs attention" value={waiting.length + failed.length} sub={`${waiting.length} in review · ${failed.length} failed in staging`} accent="#d97706" />
      </div>

      <div className="grid gap-4">
        <div className="card-pad">
          <div className="mb-2 flex items-center justify-between"><span className="h-section">Sprint burndown</span><Link href="/analytics" className="text-sm text-neon">View analytics</Link></div>
          <BurndownChart data={burn} unit={snap.usePoints ? "pts" : "tickets"} />
        </div>
        <div className="card-pad">
          <div className="mb-2 h-section">Tickets by status</div>
          <StatusBars data={statusData} />
        </div>
      </div>

      <div className="card-pad">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="h-section">Progress by developer</span>
          <span className="flex items-center gap-3 text-xs text-mute">
            <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-neon-lime" />Completed</span>
            <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-neon/40" />In flight</span>
            <span className="flex items-center gap-1"><i className="inline-block h-3 w-0.5 bg-ink" />Expected by today (allows for leave)</span>
          </span>
        </div>
        <div className="divide-y divide-line">
          {rows.map((r) => {
            const dp = paceOf(r.d.id);
            const c = rowColor(r.pct, dp.expectedPct);
            return (
              <div key={r.d.id} className="flex items-center gap-4 py-3">
                <div className="flex w-44 shrink-0 items-center gap-2"><Avatar name={r.d.name} hue={r.d.avatarHue} /><div className="min-w-0"><div className="truncate text-sm">{r.d.name}</div>{(dp.leaveDays > 0 || dp.holidayDays > 0) && <div className="truncate text-xs text-mute">{dp.leaveDays > 0 ? `${dp.leaveDays} leave day${dp.leaveDays === 1 ? "" : "s"}` : ""}{dp.leaveDays > 0 && dp.holidayDays > 0 ? " · " : ""}{dp.holidayDays > 0 ? `${dp.holidayDays} holiday${dp.holidayDays === 1 ? "" : "s"}` : ""} this sprint</div>}</div></div>
                <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-line">
                  <div className="absolute inset-y-0 left-0 bg-neon/25" style={{ width: `${Math.min(100, r.pct + r.wipPct)}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${r.pct}%`, background: c }} />
                  <div className="absolute inset-y-0 w-0.5 bg-ink/80" style={{ left: `${dp.expectedPct}%` }} />
                </div>
                <div className="w-40 shrink-0 text-right">
                  <span className="text-lg font-semibold" style={{ color: fg(c) }}>{r.doneTickets}</span><span className="text-sm text-mute"> / {r.total} tickets</span>
                  <div className="text-xs text-mute">{Math.round(r.pct)}% done{r.wipTickets ? ` · ${r.wipTickets} in flight` : ""}{r.pts ? ` · ${r.pts} pts` : ""}</div>
                </div>
              </div>
            );
          })}
        </div>
        {unassigned.length > 0 && <div className="mt-2 text-xs text-neon-amber">{unassigned.length} unassigned ticket{unassigned.length > 1 ? "s" : ""} not assigned to anyone</div>}
        {!rows.length && <Empty>No tickets assigned in this sprint yet.</Empty>}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="card-pad">
          <div className="mb-3 flex items-center gap-2 h-section"> Team activity</div>
          <div className="space-y-3">
            {devs.map((d) => {
              const s = live.find((l) => l.developerId === d.id);
              const timer = d.timers[0];
              const away = paceOf(d.id).awayToday;
              const today = sumEntries(todayEntries.filter((e) => e.developerId === d.id), now);
              return (
                <div key={d.id} className="flex items-center gap-3">
                  <div className="relative"><Avatar name={d.name} hue={d.avatarHue} />{s && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel bg-neon-lime" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{d.name}</div>
                    <div className="truncate text-xs text-mute">{timer ? <><span className="text-neon">{timer.ticket.key}</span> {timer.ticket.title}</> : s ? `Working since ${fmtTime(s.startedAt)}` : away === 1 ? "On leave today" : away > 0 ? "Half-day leave today" : snap.pace.holidaysToday ? "Public holiday" : "Not working"}</div>
                  </div>
                  <div className="text-xs text-mute">{fmtDur(today)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-pad">
          <div className="mb-3 flex items-center gap-2 h-section"> Upcoming meetings</div>
          {meetings.length ? <div className="space-y-2">{meetings.map((m) => (
            <Link href={`/meetings#${m.id}`} key={m.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm transition hover:bg-panel2">
              <div><div>{m.title}</div><div className="text-xs text-mute">{fmtDay(m.startsAt)} · {fmtTime(m.startsAt)}–{fmtTime(m.endsAt)}</div></div>
              {m.meetUrl && <span className="chip text-neon">Join</span>}
            </Link>))}</div> : <Empty>No meetings in the next 2 days.</Empty>}
        </div>

        <div className="card-pad">
          <div className="mb-3 flex items-center gap-2 h-section"> Needs attention</div>
          <ul className="space-y-2 text-sm">
            {failed.map((t) => <li key={t.id}><Link href={`/tickets/${t.id}`} className="flex items-start gap-2 hover:text-ink"><StatusBadge status="FAILED_STG" /><span className="min-w-0 truncate"><span className="text-mute">{t.key}</span> {t.title}</span></Link></li>)}
            {waiting.slice(0, 4).map((t) => <li key={t.id}><Link href={`/tickets/${t.id}`} className="flex items-start gap-2 hover:text-ink"><StatusBadge status={t.status} /><span className="min-w-0 truncate"><span className="text-mute">{t.key}</span> {t.title}</span></Link></li>)}
            {stale.map((t) => <li key={t.id} className="text-xs text-neon-amber">{t.key} has had no time logged for 2+ days</li>)}
            {!failed.length && !waiting.length && !stale.length && <li className="text-mute">Nothing needs attention.</li>}
          </ul>
        </div>
      </div>

      <div className="card-pad">
        <div className="mb-3 h-section">Recent activity</div>
        <div className="grid gap-2 md:grid-cols-2">
          {recent.map((r) => (
            <Link key={r.id} href={`/tickets/${r.ticketId}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-panel2">
              <span className="text-xs text-mute">{r.ticket.key}</span>
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
