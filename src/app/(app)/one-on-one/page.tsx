import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { canViewDeveloper } from "@/lib/permissions";
import { aiKeyFor } from "@/lib/ai";
import { latestReports, type OneOnOneReport } from "@/lib/one-on-one";
import { PageHeader, Avatar } from "@/components/ui";
import { OneOnOneActions } from "@/components/OneOnOneActions";
import { fg } from "@/lib/theme";

export const dynamic = "force-dynamic";

const STATUS = { done: "Done", in_progress: "In progress", not_started: "Not started", unknown: "No evidence" } as const;
const monthName = (k: string) => new Date(`${k}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const val = (v: number | null, unit: string) => (v == null ? "n/a" : `${v}${unit === "%" ? "%" : unit === "×" ? "×" : unit ? " " + unit : ""}`);

export default async function OneOnOne({ searchParams }: { searchParams: Promise<{ dev?: string; m?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const devId = sp.dev && sp.dev !== me.id ? sp.dev : me.id;
  if (!canViewDeveloper(me, devId)) notFound();
  const dev = await db.developer.findUnique({ where: { id: devId } });
  if (!dev) notFound();
  const [reports, ai] = await Promise.all([latestReports(devId), aiKeyFor(me.id)]);
  const picked = (sp.m && reports.find((r) => r.report.monthKey === sp.m)) || reports[0];
  const r: OneOnOneReport | undefined = picked?.report;
  const own = devId === me.id;

  return (
    <div className="space-y-6">
      <PageHeader title={own ? "My 1:1 report" : `1:1 report: ${dev.name}`} sub="The last two weeks compared with the 30 days before, with suggestions to take into your monthly 1:1."
        actions={<div className="flex items-center gap-2">{!own && <Avatar name={dev.name} hue={dev.avatarHue} size={32} />}</div>} />
      <OneOnOneActions devId={devId} hasReport={!!r} aiReady={!!ai} />

      {reports.length > 1 && (
        <div className="no-print flex flex-wrap gap-1 text-sm">
          {reports.map((x) => <Link key={x.id} href={`/one-on-one?${own ? "" : `dev=${devId}&`}m=${x.report.monthKey}`} className={`rounded-md px-3 py-1 ${x.report.monthKey === r?.monthKey ? "bg-line text-ink" : "text-mute hover:text-ink"}`}>{monthName(x.report.monthKey)}</Link>)}
        </div>
      )}

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
            {r.ai && <p className="mt-2 text-xs text-mute">Written by AI ({r.provider}, {r.model}) from your tickets, time, reviews and check-ins. Treat it as a starting point for the conversation.</p>}
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
              <div className="h-section mb-2 text-neon-lime">Improvements and what went well</div>
              <ul className="space-y-2 text-sm">
                {(r.ai?.wentWell ?? []).map((x, i) => <li key={i}><div className="font-medium">{x.point}</div><div className="text-mute">{x.evidence}</div></li>)}
                {!r.ai && r.findings.improved.map((x, i) => <li key={i}>{x}</li>)}
                {!(r.ai?.wentWell.length ?? r.findings.improved.length) && <li className="text-mute">Nothing stands out as clearly better.</li>}
              </ul>
            </div>
            <div className="card-pad">
              <div className="h-section mb-2 text-neon-amber">Needs attention</div>
              <ul className="space-y-2 text-sm">
                {(r.ai?.needsAttention ?? []).map((x, i) => <li key={i}><div className="font-medium">{x.point}</div><div className="text-mute">{x.evidence}</div></li>)}
                {!r.ai && r.findings.attention.map((x, i) => <li key={i}>{x}</li>)}
                {!(r.ai?.needsAttention.length ?? r.findings.attention.length) && <li className="text-mute">Nothing stands out as clearly worse.</li>}
              </ul>
            </div>
          </div>

          {r.ai?.vsLastMonth && <div className="card-pad"><div className="h-section mb-2">Compared with last month</div><p className="text-sm leading-relaxed">{r.ai.vsLastMonth}</p>
            {r.ai.previousSuggestions.length > 0 && <div className="mt-4"><div className="mb-1 text-xs font-medium text-mute">What happened with last month's suggestions</div>
              <ul className="space-y-1 text-sm">{r.ai.previousSuggestions.map((x, i) => <li key={i}><span className="chip mr-2">{STATUS[x.status]}</span>{x.suggestion}{x.note && <span className="text-mute"> · {x.note}</span>}</li>)}</ul></div>}</div>}

          {r.ai && r.ai.suggestions.length > 0 && (
            <div className="card-pad">
              <div className="h-section mb-3">AI suggestions for improvement</div>
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

          {r.done.length > 0 && <div className="card-pad"><div className="h-section mb-2">What you finished in the last two weeks</div>
            <ul className="divide-y divide-line text-sm">{r.done.map((t) => <li key={t.key} className="flex items-center gap-3 py-1.5"><span className="text-xs text-mute">{t.key}</span><span className="min-w-0 flex-1 truncate">{t.title}</span><span className="chip">{t.type.toLowerCase()}</span>{t.points > 0 && <span className="text-xs text-mute">{t.points} pts</span>}</li>)}</ul></div>}
        </div>
      )}
    </div>
  );
}
