import { fg } from "@/lib/theme";
import Link from "next/link";
import { after } from "next/server";
import { autoGenerateOneOnOnes } from "@/lib/one-on-one";
import { runNotifications } from "@/lib/notify/run";
import * as svc from "@/lib/services";
import { db } from "@/lib/db";
import { activeSprint, sprintSnapshot, DAY } from "@/lib/queries";
import { Avatar, Progress, StatusBadge, Empty } from "@/components/ui";
import { BurndownChart } from "@/components/Charts";
import { STATUS_META, STATUS_ORDER } from "@/lib/workflow";
import { fmtDay, fmtDur, fmtTime } from "@/lib/time";
import { sumEntries, isDone } from "@/lib/analytics";
import { idleWorkdays } from "@/lib/pace";
import { localDate } from "@/lib/time";

export default async function Overview() {

  after(() => Promise.all([svc.processEndedMeetings(), autoGenerateOneOnOnes(), runNotifications()]).then(() => {}, () => {})); // notes for meetings that just ended, without anyone pressing a button
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

  const healthTone = health[0] === "On track" ? "bg-neon-lime/10 text-neon-lime" : health[0] === "At risk" ? "bg-neon-amber/10 text-neon-amber" : "bg-neon-red/10 text-neon-red";
  const attention = failed.length + waiting.length + stale.length;
  const stat = (label: string, value: React.ReactNode, sub: React.ReactNode) => (
    <div className="min-w-0 px-5 first:pl-0 last:pr-0 max-lg:py-3"><div className="text-xs text-mute">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</div><div className="mt-0.5 truncate text-xs text-mute">{sub}</div></div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5"><h1 className="text-2xl font-semibold tracking-tight">{sprint.name}</h1><span className={`pill ${healthTone}`}><i className="h-1.5 w-1.5 rounded-full bg-current" />{health[0]}</span></div>
          <p className="mt-1 max-w-2xl text-sm text-mute">{sprint.goal} · {fmtDay(sprint.startDate)} → {fmtDay(sprint.endDate)}</p>
        </div>
        <Link href="/board" className="btn-primary">Open board</Link>
      </div>

      <section className="card-pad">
        <div className="grid divide-line lg:grid-cols-4 lg:divide-x max-lg:grid-cols-2 max-lg:gap-x-4">
          {stat("Tickets completed", <>{doneCount}<span className="text-base font-normal text-mute"> / {snap.tickets.length}</span></>, `${Math.round(pace)}% of the sprint${snap.usePoints ? ` · ${snap.donePts}/${snap.points} pts` : ""}`)}
          {stat("Working days left", snap.daysLeft, `Today included, weekends skipped · ${Math.round(snap.elapsedPct)}% used${leaveTotal ? ` · ${leaveTotal} leave day${leaveTotal === 1 ? "" : "s"}` : ""}`)}
          {stat("Hours logged", <>{Math.round(snap.loggedHrs)}<span className="text-base font-normal text-mute">h</span></>, `of ${Math.round(snap.estHrs)}h estimated`)}
          {stat("Needs attention", attention, `${waiting.length} in review · ${failed.length} failed in staging`)}
        </div>
        <div className="mt-6">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-line" role="img" aria-label="Tickets by status">
            {statusData.filter((d) => d.value > 0).map((d) => <div key={d.name} title={`${d.name}: ${d.value}`} style={{ width: `${(d.value / Math.max(1, snap.tickets.length)) * 100}%`, background: fg(d.color) }} className="first:rounded-l-full last:rounded-r-full" />)}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-mute">
            {statusData.filter((d) => d.value > 0).map((d) => <span key={d.name} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: fg(d.color) }} />{d.name} <b className="font-semibold text-ink">{d.value}</b></span>)}
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <section className="card-pad">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Progress by developer</h2>
              <span className="flex items-center gap-3 text-xs text-mute">
                <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-neon-lime" />Done</span>
                <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-neon/40" />In flight</span>
                <span className="flex items-center gap-1"><i className="inline-block h-3 w-0.5 bg-ink" />Expected today</span>
              </span>
            </div>
            <div className="divide-y divide-line/70">
              {rows.map((r) => {
                const dp = paceOf(r.d.id);
                const c = rowColor(r.pct, dp.expectedPct);
                return (
                  <div key={r.d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                    <div className="flex w-44 shrink-0 items-center gap-3"><Avatar name={r.d.name} hue={r.d.avatarHue} id={r.d.id} ver={r.d.avatarVer} /><div className="min-w-0"><div className="truncate text-sm font-medium">{r.d.name}</div>{(dp.leaveDays > 0 || dp.holidayDays > 0) && <div className="truncate text-xs text-mute">{dp.leaveDays > 0 ? `${dp.leaveDays} leave day${dp.leaveDays === 1 ? "" : "s"}` : ""}{dp.leaveDays > 0 && dp.holidayDays > 0 ? " · " : ""}{dp.holidayDays > 0 ? `${dp.holidayDays} holiday${dp.holidayDays === 1 ? "" : "s"}` : ""} this sprint</div>}</div></div>
                    <div className="relative h-2.5 min-w-[140px] flex-1 overflow-hidden rounded-full bg-line">
                      <div className="absolute inset-y-0 left-0 bg-neon/25" style={{ width: `${Math.min(100, r.pct + r.wipPct)}%` }} />
                      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${r.pct}%`, background: c }} />
                      <div className="absolute inset-y-0 w-0.5 bg-ink/80" style={{ left: `${dp.expectedPct}%` }} />
                    </div>
                    <div className="w-36 shrink-0 text-right">
                      <span className="text-base font-semibold" style={{ color: fg(c) }}>{r.doneTickets}</span><span className="text-sm text-mute"> / {r.total}</span>
                      <div className="text-xs text-mute">{Math.round(r.pct)}%{r.wipTickets ? ` · ${r.wipTickets} in flight` : ""}{r.pts ? ` · ${r.pts} pts` : ""}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {unassigned.length > 0 && <div className="mt-2 text-xs text-neon-amber">{unassigned.length} unassigned ticket{unassigned.length > 1 ? "s" : ""} not assigned to anyone</div>}
            {!rows.length && <Empty>No tickets assigned in this sprint yet.</Empty>}
          </section>

          <section className="card-pad">
            <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Sprint burndown</h2><Link href="/analytics" className="text-sm font-medium text-neon hover:underline">View analytics</Link></div>
            <BurndownChart data={burn} unit={snap.usePoints ? "pts" : "tickets"} />
          </section>

          <section className="card-pad">
            <h2 className="mb-3 text-sm font-semibold">Recent activity</h2>
            <div className="grid gap-1 md:grid-cols-2">
              {recent.map((r) => (
                <Link key={r.id} href={`/tickets/${r.ticketId}`} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-panel2">
                  <span className="font-mono text-xs text-mute">{r.ticket.key}</span>
                  <span className="min-w-0 flex-1 truncate">{r.ticket.title}</span>
                  <StatusBadge status={r.to} />
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="card-pad">
            <h2 className="rail-title">Needs attention {attention > 0 && <span className="pill bg-neon-amber/10 text-neon-amber">{attention}</span>}</h2>
            <ul className="space-y-2.5 text-sm">
              {failed.map((t) => <li key={t.id}><Link href={`/tickets/${t.id}`} className="flex items-start gap-2 hover:text-ink"><StatusBadge status="FAILED_STG" /><span className="min-w-0 truncate"><span className="text-mute">{t.key}</span> {t.title}</span></Link></li>)}
              {waiting.slice(0, 4).map((t) => <li key={t.id}><Link href={`/tickets/${t.id}`} className="flex items-start gap-2 hover:text-ink"><StatusBadge status={t.status} /><span className="min-w-0 truncate"><span className="text-mute">{t.key}</span> {t.title}</span></Link></li>)}
              {stale.map((t) => <li key={t.id} className="text-xs text-neon-amber">{t.key} has had no time logged for 2+ days</li>)}
              {!attention && <li className="text-mute">Nothing needs attention.</li>}
            </ul>
          </section>

          <section className="card-pad">
            <h2 className="rail-title">Team today</h2>
            <div className="space-y-3.5">
              {devs.map((d) => {
                const s = live.find((l) => l.developerId === d.id);
                const timer = d.timers[0];
                const away = paceOf(d.id).awayToday;
                const today = sumEntries(todayEntries.filter((e) => e.developerId === d.id), now);
                return (
                  <div key={d.id} className="flex items-center gap-3">
                    <div className="relative"><Avatar name={d.name} hue={d.avatarHue} id={d.id} ver={d.avatarVer} />{s && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel bg-neon-lime" />}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{d.name}</div>
                      <div className="truncate text-xs text-mute">{timer ? <><span className="text-neon">{timer.ticket.key}</span> {timer.ticket.title}</> : s ? `Working since ${fmtTime(s.startedAt)}` : away === 1 ? "On leave today" : away > 0 ? "Half-day leave today" : snap.pace.holidaysToday ? "Public holiday" : "Not working"}</div>
                    </div>
                    <div className="text-xs tabular-nums text-mute">{fmtDur(today)}</div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card-pad">
            <h2 className="rail-title">Upcoming meetings <Link href="/meetings" className="text-xs font-medium text-neon hover:underline">All</Link></h2>
            {meetings.length ? <div className="space-y-2">{meetings.map((m) => (
              <Link href={`/meetings#${m.id}`} key={m.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5 text-sm transition hover:bg-panel2">
                <div className="min-w-0"><div className="truncate font-medium">{m.title}</div><div className="text-xs text-mute">{fmtDay(m.startsAt)} · {fmtTime(m.startsAt)}–{fmtTime(m.endsAt)}</div></div>
                {m.meetUrl && <span className="pill bg-neon/10 text-neon">Join</span>}
              </Link>))}</div> : <Empty>No meetings in the next 2 days.</Empty>}
          </section>
        </aside>
      </div>
      <Progress pct={0} className="hidden" />
    </div>
  );
}
