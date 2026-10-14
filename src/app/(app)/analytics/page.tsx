import { fg } from "@/lib/theme";
import { db } from "@/lib/db";
import { PageHeader, Kpi } from "@/components/ui";
import { VelocityChart, StackedBars, LineSeries, HBar } from "@/components/Charts";
import { developerStats, dwellByColumn, estimateAccuracy, velocity } from "@/lib/queries";
import { STATUS_META, STATUS_ORDER } from "@/lib/workflow";

export default async function Analytics() {
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
      <PageHeader title="Analytics" sub="Sprint health, developer velocity, flow and estimate accuracy." />
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
          <thead className="bg-panel2 text-left text-xs uppercase tracking-wider text-mute"><tr><th className="p-3">Developer</th><th>Points done</th><th>Tickets</th><th>Cycle</th><th>Accuracy</th><th>14d hours</th><th>Tracked</th><th>Bugs fixed</th><th>Failed stg</th></tr></thead>
          <tbody>{devStats.map((s) => (
            <tr key={s.d.id} className="border-t border-line/60">
              <td className="p-3"><a href={`/team/${s.d.id}`} className="hover:text-neon">{s.d.name}</a></td>
              <td className="font-mono">{s.donePoints}</td><td className="font-mono">{s.doneCount}</td><td className="font-mono">{s.cycleDays ? s.cycleDays.toFixed(1) + "d" : "—"}</td>
              <td className="font-mono" style={{ color: s.accuracy == null ? undefined : s.accuracy > 1.25 ? fg("#fb7185") : s.accuracy < 0.75 ? fg("#fbbf24") : fg("#a3e635") }}>{s.accuracy ? Math.round(s.accuracy * 100) + "%" : "—"}</td>
              <td className="font-mono">{s.worked.toFixed(0)}h</td><td className="font-mono">{s.worked ? Math.round((s.tracked / s.worked) * 100) + "%" : "—"}</td><td className="font-mono">{s.bugs}</td><td className="font-mono">{s.failedStg}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
