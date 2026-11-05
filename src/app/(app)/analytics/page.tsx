import { fg } from "@/lib/theme";
import { db } from "@/lib/db";
import { PageHeader, Kpi } from "@/components/ui";
import { VelocityChart, StackedBars, LineSeries, HBar } from "@/components/Charts";
import { developerStats, dwellByColumn, estimateAccuracy, velocity } from "@/lib/queries";
import { STATUS_META, STATUS_ORDER } from "@/lib/workflow";
import { requireUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { loadEngagement } from "@/lib/engagement-data";
import { forViewer, meetingEngagement, toneForBalance } from "@/lib/engagement";
import { fmtTalk } from "@/lib/transcript";
import Link from "next/link";

export default async function Analytics({ searchParams }: { searchParams: Promise<{ eng?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const canLead = atLeast(me.access, "LEAD");
  const eng = await loadEngagement();
  const byMonth = sp.eng === "month";
  const periods = (byMonth ? eng.byMonth : eng.bySprint).map((p) => forViewer(p, me.id, canLead));
  const withData = periods.filter((p) => p.meetings > 0);
  const latest = withData.at(-1) ?? null;
  const names = [...new Set(periods.flatMap((p) => p.people.map((x) => x.name)))];
  const talkStack = periods.map((p) => ({ name: p.label, ...Object.fromEntries(names.map((n) => [n, Math.round(((p.people.find((x) => x.name === n)?.talkSec ?? 0) / 60) * 10) / 10])) }));
  const allBalance = withData.length ? withData.reduce((a, p) => a + (p.avgBalance ?? 0), 0) / withData.length : null;
  const [vel, dwell, acc, devStats, failed, total] = await Promise.all([
    velocity(), dwellByColumn(), estimateAccuracy(), developerStats(),
    db.transition.count({ where: { to: "FAILED_STG" } }), db.transition.count({ where: { to: "DEPLOYED_STG" } }),
  ]);
  const closed = vel.filter((v) => v.state === "CLOSED");
  const avgVel = closed.length ? closed.reduce((a, v) => a + v.completed, 0) / closed.length : 0;
  const devNames = [...new Set(vel.flatMap((v) => Object.values(v.perDev).map((p) => p.name)))];
  const perDevStack = vel.map((v) => ({ name: v.name, ...Object.fromEntries(devNames.map((n) => [n, Object.values(v.perDev).find((p) => p.name === n)?.points ?? 0])) }));
  const hoursStack = vel.map((v) => ({ name: v.name, ...Object.fromEntries(devNames.map((n) => [n, Math.round((Object.values(v.perDev).find((p) => p.name === n)?.hours ?? 0) * 10) / 10])) }));
  const dwellData = STATUS_ORDER.filter((s) => dwell[s] != null && s !== "DONE").map((s) => ({ name: STATUS_META[s].label, value: Math.round(dwell[s] * 10) / 10 }));
  const stgFailRate = total ? Math.round((failed / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" sub="Delivery speed, flow and estimate accuracy." />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Kpi label="Avg velocity" value={Math.round(avgVel * 10) / 10} sub="points / closed sprint" accent="#6ee7ff" spark={closed.map((v) => v.completed)} />
        <Kpi label="Avg cycle time" value={`${(closed.reduce((a, v) => a + v.cycleDays, 0) / Math.max(1, closed.length)).toFixed(1)}d`} sub="In Progress → Done" accent="#a78bfa" spark={closed.map((v) => v.cycleDays)} />
        <Kpi label="Estimate accuracy" value={acc.n ? `${Math.round(acc.avg * 100)}%` : "—"} sub="actual ÷ estimate" accent="#fbbf24" />
        <Kpi label="Staging failure rate" value={`${stgFailRate}%`} sub={`${failed} of ${total} deploys`} accent="#fb7185" />
        <Kpi label="Throughput" value={closed.length ? Math.round(closed.reduce((a, v) => a + v.doneTickets, 0) / closed.length) : 0} sub="tickets / sprint" accent="#a3e635" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card-pad"><div className="h-section mb-2">Team velocity (story points)</div><VelocityChart data={vel.map((v) => ({ name: v.name, committed: v.committed, completed: v.completed }))} /></div>
        <div className="card-pad"><div className="h-section mb-2">Points completed per developer</div><StackedBars data={perDevStack} keys={devNames} /></div>
        <div className="card-pad"><div className="h-section mb-2">Hours logged per developer</div><StackedBars data={hoursStack} keys={devNames} unit="h" /></div>
        <div className="card-pad"><div className="h-section mb-2">Cycle time by sprint (days)</div><LineSeries data={vel.map((v) => ({ name: v.name, cycle: Math.round(v.cycleDays * 10) / 10 }))} lines={[{ key: "cycle", color: "#a78bfa", name: "Avg cycle days" }]} unit="d" /></div>
        <div className="card-pad xl:col-span-2"><div className="h-section mb-1">Where cards wait — average hours per column</div><p className="mb-2 text-xs text-mute">Long review or staging columns are the bottleneck to attack first.</p><HBar data={dwellData} unit="h" /></div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-panel2 text-left text-xs text-mute"><tr><th className="p-3">Developer</th><th>Points done</th><th>Tickets</th><th>Cycle</th><th>Accuracy</th><th>14d hours</th><th>Tracked</th><th>Bugs fixed</th><th>Failed stg</th></tr></thead>
          <tbody>{devStats.map((s) => (
            <tr key={s.d.id} className="border-t border-line/60">
              <td className="p-3"><a href={`/team/${s.d.id}`} className="hover:text-neon">{s.d.name}</a></td>
              <td className="font-mono">{s.donePoints}</td><td className="font-mono">{s.doneCount}</td><td className="font-mono">{s.cycleDays ? s.cycleDays.toFixed(1) + "d" : "—"}</td>
              <td className="font-mono" style={{ color: s.accuracy == null ? undefined : s.accuracy > 1.25 ? fg("#fb7185") : s.accuracy < 0.75 ? fg("#fbbf24") : fg("#a3e635") }}>{s.accuracy ? Math.round(s.accuracy * 100) + "%" : "—"}</td>
              <td className="font-mono">{s.worked.toFixed(0)}h</td><td className="font-mono">{s.worked ? Math.round((s.tracked / s.worked) * 100) + "%" : "—"}</td><td className="font-mono">{s.bugs}</td><td className="font-mono">{s.failedStg}</td>
            </tr>))}</tbody>
        </table>
      </div>

      <div className="space-y-4" id="engagement">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Meeting engagement</h2>
            <p className="text-sm text-mute">Who is active in meetings, measured by speaking time from transcripts. {canLead ? "You see everyone." : "You see the team totals and your own numbers."}</p></div>
          <div className="flex gap-1 rounded-lg border border-line bg-panel p-1 text-sm">
            <Link href="/analytics#engagement" className={`rounded-md px-3 py-1 ${!byMonth ? "bg-line text-ink" : "text-mute hover:text-ink"}`}>By sprint</Link>
            <Link href="/analytics?eng=month#engagement" className={`rounded-md px-3 py-1 ${byMonth ? "bg-line text-ink" : "text-mute hover:text-ink"}`}>By month</Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Kpi label="Meetings analysed" value={eng.analysed} sub={`of ${eng.total} in the last 200 days`} accent="#6ee7ff" />
          <Kpi label="Balance of talk time" value={allBalance == null ? "—" : `${Math.round(allBalance * 100)}%`} sub={toneForBalance(allBalance)} accent="#a3e635" />
          <Kpi label="Avg speakers" value={latest ? latest.avgSpeakers : "—"} sub={latest ? `per meeting, ${latest.label}` : "no data yet"} accent="#a78bfa" />
          <Kpi label="Invited, not speaking" value={latest ? latest.silentAttendees : "—"} sub={latest ? `${latest.label}, summed over meetings` : "no data yet"} accent="#fbbf24" />
        </div>
        {!withData.length ? (
          <div className="card-pad text-sm text-mute">No meeting has speaker data yet. Open a meeting under <Link href="/meetings" className="text-neon">Meetings</Link>, import its Meet transcript or upload one, and the engagement numbers appear here.</div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="card-pad"><div className="h-section mb-2">Talk time by {byMonth ? "month" : "sprint"} (minutes)</div>{names.length ? <StackedBars data={talkStack} keys={names} unit="m" /> : <p className="text-sm text-mute">No speaking time linked to you yet. Names in the transcript must match your name in the app.</p>}</div>
            <div className="card overflow-x-auto">
              <div className="p-4 pb-0"><div className="h-section">{latest!.label}: {latest!.meetings} meeting{latest!.meetings === 1 ? "" : "s"}, {fmtTalk(latest!.totalTalkSec)} of talk</div></div>
              <table className="mt-2 w-full min-w-[460px] text-sm">
                <thead className="text-left text-xs text-mute"><tr><th className="p-3 font-medium">Person</th><th className="font-medium">Spoke in</th><th className="font-medium">Talk time</th><th className="font-medium">Avg share</th><th className="pr-3 font-medium">Turns</th></tr></thead>
                <tbody>{latest!.people.map((p) => (
                  <tr key={p.key} className="border-t border-line/60"><td className="p-3">{p.name}{p.estimated && <span className="ml-1 text-xs text-mute" title="Estimated from word counts: the transcript had no timestamps">~</span>}</td><td>{p.participationPct}%</td><td>{fmtTalk(p.talkSec)}</td><td>{p.avgSharePct}%</td><td className="pr-3">{p.turns}</td></tr>))}
                  {!latest!.people.length && <tr><td className="p-3 text-mute" colSpan={5}>Your name does not appear in this period's transcripts.</td></tr>}
                </tbody>
              </table>
              <p className="px-4 pb-3 pt-1 text-xs text-mute">Spoke in = share of analysed meetings where the person said something. ~ marks estimates from word counts.</p>
            </div>
          </div>
        )}
        {eng.meetings.length > 0 && (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-panel2 text-left text-xs text-mute"><tr><th className="p-3 font-medium">Meeting</th><th className="font-medium">Speakers</th><th className="font-medium">Most active share</th><th className="font-medium">Balance</th><th className="pr-3 font-medium">Talk time</th></tr></thead>
              <tbody>{eng.meetings.slice(0, 10).map((mt) => { const e = meetingEngagement(mt); return (
                <tr key={mt.id} className="border-t border-line/60"><td className="p-3"><Link href={`/meetings#${mt.id}`} className="hover:text-neon">{mt.title}</Link><div className="text-xs text-mute">{mt.startsAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div></td><td>{e.speakers}</td><td>{Math.round(e.dominantShare)}%</td><td>{toneForBalance(e.balance)}</td><td className="pr-3">{fmtTalk(e.totalTalkSec)}</td></tr>); })}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
