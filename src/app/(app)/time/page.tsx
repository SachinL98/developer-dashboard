import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, Avatar, Progress, Kpi, StatusBadge } from "@/components/ui";
import { TimerButton } from "@/components/TimerButton";
import { fmtDay, fmtDur, fmtTime, hours, TZ } from "@/lib/time";
import { sumEntries } from "@/lib/analytics";
import { DAY } from "@/lib/queries";
import { approvedLeave, getHolidays } from "@/lib/leave";
import { leaveFractions } from "@/lib/capacity";

const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

export default async function TimePage() {
  const me = await requireUser();
  const now = new Date();
  const since = new Date(now.getTime() - 13 * DAY);
  const [devs, sessions, entries, mine] = await Promise.all([
    db.developer.findMany({ orderBy: { name: "asc" } }),
    db.workSession.findMany({ where: { startedAt: { gte: since } }, orderBy: { startedAt: "desc" } }),
    db.timeEntry.findMany({ where: { startedAt: { gte: since } }, include: { ticket: true } }),
    db.ticket.findMany({ where: { assigneeId: me?.id, status: { in: ["READY_TO_DEV", "IN_PROGRESS", "FAILED_STG"] } }, include: { timeEntries: true }, orderBy: { rank: "asc" } }),
  ]);
  const days = Array.from({ length: 14 }, (_, i) => dayKey(new Date(now.getTime() - (13 - i) * DAY)));
  const [leaves, holidays] = await Promise.all([approvedLeave(days[0], days[days.length - 1]), getHolidays()]);
  const holSet = new Set(holidays.map((h) => h.date));
  const grid = devs.map((d) => {
    const away = leaveFractions(leaves, d.id, holSet);
    const perDay = Object.fromEntries(days.map((k) => [k, 0]));
    for (const s of sessions.filter((x) => x.developerId === d.id)) { const k = dayKey(s.startedAt); if (k in perDay) perDay[k] += hours(sumEntries([s], now)); }
    const tracked = hours(sumEntries(entries.filter((e) => e.developerId === d.id), now));
    const worked = Object.values(perDay).reduce((a, b) => a + b, 0);
    return { d, perDay, worked, tracked, away };
  });
  const recent = sessions.filter((x) => x.startedAt.getTime() > now.getTime() - 7 * DAY).slice(0, 30);
  const ids = [...new Set(recent.flatMap((x) => [...x.planTicketIds, ...x.doneTicketIds]))];
  const tix = ids.length ? await db.ticket.findMany({ where: { id: { in: ids } }, select: { id: true, key: true, title: true } }) : [];
  const tk = new Map(tix.map((t) => [t.id, t]));
  const devName = new Map(devs.map((d) => [d.id, d]));
  const keys = (list: string[]) => list.map((i) => tk.get(i)).filter(Boolean).map((t) => (
    <Link key={t!.id} href={`/tickets/${t!.id}`} title={t!.title} className="chip hover:text-ink">{t!.key}</Link>));
  const todayKey = dayKey(now);
  const clockedIn = sessions.filter((s) => !s.endedAt);
  const mySessions = sessions.filter((s) => s.developerId === me?.id).slice(0, 8);
  const heat = (h: number) => (h <= 0 ? "rgb(var(--panel2))" : `rgba(110,231,255,${Math.min(1, 0.15 + h / 10)})`);

  return (
    <div className="space-y-6">
      <PageHeader title="Time" sub="Your work day, ticket timers and progress." />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Clocked in now" value={clockedIn.length} sub={`of ${devs.length} developers`} accent="#a3e635" />
        <Kpi label="Team hours today" value={Math.round(grid.reduce((a, g) => a + g.perDay[todayKey], 0) * 10) / 10} accent="#6ee7ff" />
        <Kpi label="Team hours (14d)" value={Math.round(grid.reduce((a, g) => a + g.worked, 0))} accent="#a78bfa" spark={days.map((k) => grid.reduce((a, g) => a + g.perDay[k], 0))} />
        <Kpi label="Tracked on cards" value={`${Math.round((grid.reduce((a, g) => a + g.tracked, 0) / Math.max(1, grid.reduce((a, g) => a + g.worked, 0))) * 100)}%`} sub="of clocked time" accent="#f472b6" />
      </div>

      <div className="card-pad overflow-x-auto">
        <div className="h-section mb-1">Hours worked · last 14 days</div>
        <p className="mb-3 text-xs text-mute">L = on leave, H = public holiday.</p>
        <table className="w-full min-w-[760px] text-xs">
          <thead><tr><th className="w-44 text-left font-normal text-mute" />{days.map((k) => <th key={k} className="pb-2 font-normal text-mute">{k.slice(8)}</th>)}<th className="pb-2 text-right font-normal text-mute">Total</th></tr></thead>
          <tbody>{grid.map(({ d, perDay, worked, away }) => (
            <tr key={d.id}>
              <td className="py-1"><Link href={`/team/${d.id}`} className="flex items-center gap-2 hover:text-ink"><Avatar name={d.name} hue={d.avatarHue} size={22} />{d.name}</Link></td>
              {days.map((k) => { const lv = away.get(k) ?? 0, ph = holSet.has(k); return <td key={k} className="p-0.5"><div title={`${k}: ${perDay[k].toFixed(1)}h${lv ? (lv === 1 ? " · on leave" : " · half-day leave") : ""}${ph ? " · public holiday" : ""}`} className="grid h-7 place-items-center rounded font-mono text-[10px]" style={{ background: perDay[k] > 0 ? heat(perDay[k]) : lv ? "color-mix(in srgb, rgb(var(--neon-amber)) 18%, transparent)" : heat(0), color: perDay[k] > 5 ? "#07090f" : "rgb(var(--mute))" }}>{perDay[k] > 0 ? perDay[k].toFixed(0) : lv ? (lv === 1 ? "L" : "½L") : ph ? "H" : ""}</div></td>; })}
              <td className="pl-2 text-right font-mono">{worked.toFixed(0)}h</td>
            </tr>))}</tbody>
        </table>
      </div>

      <div className="card-pad">
        <div className="h-section mb-1">Daily summaries</div>
        <p className="mb-3 text-sm text-mute">What each developer planned at the start of the day and reported at the end. Last 7 days.</p>
        <div className="divide-y divide-line">
          {recent.map((x) => {
            const d = devName.get(x.developerId);
            return (
              <div key={x.id} className="grid gap-3 py-3 md:grid-cols-[200px_1fr_1fr]">
                <div className="flex items-start gap-2">
                  {d && <Avatar name={d.name} hue={d.avatarHue} size={28} />}
                  <div className="min-w-0"><div className="truncate text-sm font-medium">{d?.name}</div>
                    <div className="text-xs text-mute">{fmtDay(x.startedAt)} · {fmtTime(x.startedAt)} – {x.endedAt ? fmtTime(x.endedAt) : "now"} · {fmtDur((x.endedAt ?? now).getTime() - x.startedAt.getTime())}</div></div>
                </div>
                <div className="min-w-0 text-sm"><div className="mb-1 text-xs font-medium text-mute">Plan for the day</div>
                  <div className="flex flex-wrap gap-1">{keys(x.planTicketIds)}</div>
                  {x.planNote ? <p className="mt-1 whitespace-pre-wrap">{x.planNote}</p> : !x.planTicketIds.length && <span className="text-mute">No plan recorded</span>}</div>
                <div className="min-w-0 text-sm"><div className="mb-1 text-xs font-medium text-mute">End of day</div>
                  {x.endedAt ? (<><div className="flex flex-wrap gap-1">{keys(x.doneTicketIds)}</div>
                    {x.doneNote ? <p className="mt-1 whitespace-pre-wrap">{x.doneNote}</p> : !x.doneTicketIds.length && <span className="text-mute">No summary recorded</span>}</>) : <span className="text-mute">Still working</span>}</div>
              </div>
            );
          })}
          {!recent.length && <p className="py-6 text-center text-sm text-mute">No work days recorded yet.</p>}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="card-pad xl:col-span-2">
          <div className="h-section mb-3">My cards · {me?.name}</div>
          <div className="space-y-3">
            {mine.map((t) => {
              const logged = hours(sumEntries(t.timeEntries, now));
              const running = t.timeEntries.some((e) => !e.endedAt);
              return (
                <div key={t.id} className="rounded-xl border border-line bg-panel2 p-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1"><Link href={`/tickets/${t.id}`} className="block truncate text-sm hover:text-ink"><span className="font-mono text-xs text-mute">{t.key}</span> {t.title}</Link>
                      <div className="mt-1 flex items-center gap-3 text-xs text-mute"><StatusBadge status={t.status} /><span className="font-mono">{logged.toFixed(1)}h{t.estimateHrs ? ` / ${t.estimateHrs}h` : ""}</span></div></div>
                    {t.status === "IN_PROGRESS" && <TimerButton ticketId={t.id} running={running} />}
                  </div>
                  {t.status === "IN_PROGRESS" && <div className="mt-3 flex items-center gap-3"><Progress pct={t.progressPct} color="#a78bfa" /><span className="font-mono text-xs text-mute">{t.progressPct}%</span></div>}
                </div>
              );
            })}
            {!mine.length && <p className="py-6 text-center text-sm text-mute">No active cards assigned to you.</p>}
          </div>
        </div>
        <div className="card-pad">
          <div className="h-section mb-3">My recent days</div>
          <ul className="space-y-2 text-sm">{mySessions.map((s) => (
            <li key={s.id} className="flex justify-between"><span className="text-mute">{fmtDay(s.startedAt)}</span><span className="font-mono text-xs">{fmtTime(s.startedAt)} – {s.endedAt ? fmtTime(s.endedAt) : <span className="text-neon-lime">now</span>} · {fmtDur((s.endedAt ?? now).getTime() - s.startedAt.getTime())}</span></li>))}</ul>
        </div>
      </div>
    </div>
  );
}
