import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { OneOnOneReport } from "@/lib/one-on-one";
import { fg } from "@/lib/theme";

const STATUS = { done: "Done", in_progress: "In progress", not_started: "Not started", unknown: "No evidence" } as const;
const monthName = (k: string) => new Date(`${k}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const val = (v: number | null, unit: string) => (v == null ? "n/a" : `${v}${unit === "%" ? "%" : unit === "×" ? "×" : unit ? " " + unit : ""}`);

/** The full written 1:1 report (scorecard, wins, room to grow, suggestions, story points check). Shown under the slides in Reports. */
export function OneOnOneDetail({ r, own }: { r: OneOnOneReport | undefined; own: boolean }) {
  return (
    <>
      {!r ? (
        <div className="card-pad text-sm text-mute">
          No report yet. It is created automatically in the first week of every month, or you can generate it now with the button above.
          {!own && " Reports are visible to the person and to leads and admins."}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="card-pad">
            <div className="mb-1 text-xs text-mute">{monthName(r.monthKey)} · covers {r.curLabel} · compared with {r.baseLabel} · generated {new Date(r.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
            {r.ai ? <p className="text-base leading-relaxed">{r.ai.headline}</p> : <p className="text-sm text-mute">{r.aiNote ?? "No written analysis for this report."}</p>}
            {r.ai && <p className="mt-2 text-xs text-mute">Written by AI ({r.provider}, {r.model}) from your tickets, time, reviews and check-ins, to encourage you and give you something to talk about. It is a starting point, not a verdict.</p>}
          </div>

          <div className="card overflow-x-auto">
            <div className="p-4 pb-0"><div className="h-section">Scorecard</div><p className="mt-1 text-xs text-mute">Counts are shown per two weeks so the 30-day period compares fairly. Hours, leave and talk time are context, not good or bad.</p></div>
            <table className="mt-2 w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-mute"><tr><th className="p-3 font-medium">Measure</th><th className="font-medium">Last 2 weeks</th><th className="font-medium">Before (per 2 weeks)</th><th className="pr-3 font-medium">Change</th></tr></thead>
              <tbody>{r.rows.map((x) => (
                <tr key={x.key} className="border-t border-line/60">
                  <td className="p-3">{x.label}</td><td className="font-semibold tabular-nums">{val(x.cur, x.unit)}</td><td className="tabular-nums text-mute">{val(x.base, x.unit)}</td>
                  <td className="pr-3"><span className="inline-flex items-center gap-1" style={{ color: x.trend === "better" ? fg("#16a34a") : x.trend === "worse" ? fg("#dc2626") : undefined }}>
                    {x.trend === "better" ? <ArrowUp size={14} /> : x.trend === "worse" ? <ArrowDown size={14} /> : <Minus size={14} className="text-mute" />}
                    {x.deltaPct == null ? <span className="text-mute">{x.trend === "n/a" ? "n/a" : "new"}</span> : `${x.deltaPct > 0 ? "+" : ""}${x.deltaPct}%`}
                  </span></td>
                </tr>))}</tbody>
            </table>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card-pad">
              <div className="h-section mb-2 text-neon-lime">Wins and improvements</div>
              <ul className="space-y-2 text-sm">
                {(r.ai?.wentWell ?? []).map((x, i) => <li key={i}><div className="font-medium">{x.point}</div><div className="text-mute">{x.evidence}</div></li>)}
                {!r.ai && r.findings.improved.map((x, i) => <li key={i}>{x}</li>)}
                {!(r.ai?.wentWell.length ?? r.findings.improved.length) && <li className="text-mute">Steady work. Nothing jumped out this time.</li>}
              </ul>
            </div>
            <div className="card-pad">
              <div className="h-section mb-2 text-neon-amber">Room to grow</div>
              <ul className="space-y-2 text-sm">
                {(r.ai?.needsAttention ?? []).map((x, i) => <li key={i}><div className="font-medium">{x.point}</div><div className="text-mute">{x.evidence}</div></li>)}
                {!r.ai && r.findings.attention.map((x, i) => <li key={i}>{x}</li>)}
                {!(r.ai?.needsAttention.length ?? r.findings.attention.length) && <li className="text-mute">Nothing to worry about here. Keep going.</li>}
              </ul>
            </div>
          </div>

          {r.ai?.vsLastMonth && <div className="card-pad"><div className="h-section mb-2">Compared with last month</div><p className="text-sm leading-relaxed">{r.ai.vsLastMonth}</p>
            {r.ai.previousSuggestions.length > 0 && <div className="mt-4"><div className="mb-1 text-xs font-medium text-mute">What happened with last month's suggestions</div>
              <ul className="space-y-1 text-sm">{r.ai.previousSuggestions.map((x, i) => <li key={i}><span className="chip mr-2">{STATUS[x.status]}</span>{x.suggestion}{x.note && <span className="text-mute"> · {x.note}</span>}</li>)}</ul></div>}</div>}

          {r.ai && r.ai.suggestions.length > 0 && (
            <div className="card-pad">
              <div className="h-section mb-3">AI suggestions to help you grow</div>
              <ol className="space-y-4">{r.ai.suggestions.map((x, i) => (
                <li key={i} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neon/10 text-xs font-semibold text-neon">{i + 1}</span>
                  <div className="min-w-0"><div className="font-medium">{x.title} <span className="chip ml-1">{x.area}</span></div><p className="mt-0.5 text-sm text-mute"><b className="font-medium text-ink">Why: </b>{x.why}</p><p className="text-sm text-mute"><b className="font-medium text-ink">How: </b>{x.how}</p></div></li>))}</ol>
            </div>
          )}

          {r.ai && (r.ai.talkingPoints.length > 0 || r.ai.questionsForLead.length > 0 || r.ai.focusNextMonth.length > 0) && (
            <div className="grid gap-6 lg:grid-cols-3">
              {([["Talking points for your 1:1", r.ai.talkingPoints], ["Questions you could ask your lead", r.ai.questionsForLead], ["Focus for next month", r.ai.focusNextMonth]] as const).map(([t, items]) => items.length > 0 && (
                <div key={t} className="card-pad"><div className="h-section mb-2">{t}</div><ul className="list-disc space-y-1 pl-5 text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>))}
            </div>
          )}

          {((r.ai?.estimateCheck.length ?? 0) > 0 || (r.pointsGaps?.length ?? 0) > 0) && (
            <div className="card-pad">
              <div className="h-section mb-1">Story points check</div>
              <p className="mb-3 text-xs text-mute">Where a ticket took noticeably more or less time than its points suggest. Often the card was simply pointed low for its scope, which is an estimation gap and not a speed problem.</p>
              <ul className="space-y-3">
                {(r.ai?.estimateCheck.length ? r.ai.estimateCheck : []).map((x, i) => { const g = r.pointsGaps?.find((p) => p.key === x.key); return (
                  <li key={i} className="text-sm"><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-mute">{x.key}</span><span className="font-medium">{g?.title ?? ""}</span>
                    <span className="chip">{x.assignedPoints ?? g?.points ?? "?"} pts given</span><span className="chip border-neon/40 text-neon">{x.suggestedPoints} pts looks right</span>
                    <span className="chip">{x.verdict === "pointed_low" ? "pointed low" : x.verdict === "pointed_high" ? "pointed high" : "pointed right"}</span>{g && <span className="text-xs text-mute">{g.actualHrs}h taken vs {g.expectedHrs}h expected</span>}</div>
                    <p className="mt-0.5 text-mute">{x.reason}{x.tip ? ` Tip: ${x.tip}` : ""}</p></li>); })}
                {!r.ai?.estimateCheck.length && (r.pointsGaps ?? []).map((g) => <li key={g.key} className="text-sm"><span className="text-xs text-mute">{g.key}</span> <span className="font-medium">{g.title}</span> <span className="text-mute">· {g.points} pts, {g.actualHrs}h taken vs {g.expectedHrs}h expected</span></li>)}
              </ul>
            </div>
          )}

          {r.done.length > 0 && <div className="card-pad"><div className="h-section mb-2">What you finished in the last two weeks</div>
            <ul className="divide-y divide-line text-sm">{r.done.map((t) => <li key={t.key} className="flex items-center gap-3 py-1.5"><span className="text-xs text-mute">{t.key}</span><span className="min-w-0 flex-1 truncate">{t.title}</span><span className="chip">{t.type.toLowerCase()}</span>{t.points > 0 && <span className="text-xs text-mute">{t.points} pts</span>}</li>)}</ul></div>}
        </div>
      )}
    </>
  );
}
