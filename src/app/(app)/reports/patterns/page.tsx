import Link from "next/link";
import clsx from "clsx";
import { Download, ArrowLeft, Sprout, Target } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { atLeast, canViewPatterns } from "@/lib/permissions";
import { loadAnalysis } from "@/lib/patterns-data";
import { MIN_TICKETS, type CatStat, type PatternSummary } from "@/lib/patterns";
import { PageHeader, Kpi, Empty } from "@/components/ui";
import { LineSeries } from "@/components/Charts";

const pct = (n: number | null) => (n == null ? "n/a" : `${Math.round(n * 100)}%`);
const TREND = { improving: "Improving", worsening: "Needs attention", steady: "Steady", unknown: "Too early" } as const;
const CAT_TREND = { less: "less often", more: "more often", steady: "steady", new: "new lately", unknown: "" } as const;
const sevCls = { critical: "border-neon-red/40 text-neon-red", important: "border-neon-amber/40 text-neon-amber", minor: "border-line text-mute" } as const;

function Category({ c, total }: { c: CatStat; total: number }) {
  return (
    <details className="group rounded-xl border border-line bg-panel2 p-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{c.label}</span>
        <span className={clsx("chip", sevCls[c.worst])}>{c.worst}</span>
        {c.recurring && <span className="chip border-neon/40 text-neon">recurring</span>}
        <span className="ml-auto font-mono text-xs text-mute">{c.tickets} of {total} PRs · {Math.round(c.share * 100)}%{CAT_TREND[c.trend] ? ` · ${CAT_TREND[c.trend]}` : ""}</span>
      </summary>
      <p className="mt-2 text-sm text-mute"><b className="text-ink">Try:</b> {c.tip}</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {c.examples.map((e, i) => <li key={i} className="rounded-lg bg-panel px-3 py-2"><span className="font-mono text-xs text-mute">{e.ticketKey}{e.file ? ` · ${e.file}` : ""}</span><div>{e.title}</div>{e.detail && <div className="text-xs text-mute">{e.detail}</div>}</li>)}
      </ul>
    </details>
  );
}

function Body({ s, subject }: { s: PatternSummary; subject: "developer" | "team" }) {
  if (!s.tickets) return <Empty>No Claude reviews yet. Patterns appear after pull requests have been reviewed in Initial Review with an <code>ANTHROPIC_API_KEY</code> set.</Empty>;
  return (
    <div className="space-y-6">
      {!s.enough && <div className="rounded-lg border border-neon-amber/40 bg-neon-amber/10 px-4 py-2 text-sm text-neon-amber">Only {s.tickets} reviewed pull request{s.tickets === 1 ? "" : "s"} so far. A pattern needs at least {MIN_TICKETS}, so treat this as a first look.</div>}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Passed first try" value={pct(s.firstTryPassRate)} sub={`${s.tickets} pull requests`} accent="#a3e635" />
        <Kpi label="Avg review rounds" value={s.avgRounds ?? "n/a"} sub="per pull request" accent="#6ee7ff" />
        <Kpi label="Faults on first review" value={s.avgFirstPassScore ?? "n/a"} sub="weighted by severity" accent="#fbbf24" />
        <Kpi label="Trend" value={TREND[s.trend]} sub={s.trendDetail ? `${s.trendDetail.earlier} earlier → ${s.trendDetail.recent} recent` : "needs 4+ reviewed PRs"} accent={s.trend === "worsening" ? "#fb7185" : s.trend === "improving" ? "#a3e635" : "#a78bfa"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card-pad">
          <div className="h-section mb-3 flex items-center gap-2"><Target size={14} className="text-neon" /> Focus areas</div>
          {s.focus.length ? <ul className="space-y-3">{s.focus.map((f) => <li key={f.id}><div className="font-medium">{f.label} <span className="font-mono text-xs text-mute">· {f.tickets} of {s.tickets} PRs</span></div><p className="text-sm text-mute">{f.tip}</p></li>)}</ul>
            : <p className="text-sm text-mute">{s.enough ? `No recurring pattern stands out${subject === "team" ? " for the team" : ""}. Individual findings below are still worth a look.` : "Not enough reviews yet to call anything a pattern."}</p>}
        </div>
        <div className="card-pad">
          <div className="h-section mb-3 flex items-center gap-2"><Sprout size={14} className="text-neon-lime" /> Going well</div>
          {s.strengths.length ? <ul className="space-y-2 text-sm">{s.strengths.map((t) => <li key={t} className="flex gap-2"><span className="text-neon-lime">✓</span>{t}</li>)}</ul> : <p className="text-sm text-mute">Strengths show up as the review history grows.</p>}
        </div>
      </div>

      {s.byMonth.length > 1 && <div className="card-pad"><div className="h-section mb-2">Faults on the first review, by month</div>
        <LineSeries data={s.byMonth.map((m) => ({ name: m.label, score: m.score }))} lines={[{ key: "score", color: "#a78bfa", name: "Avg weighted faults" }]} /></div>}

      <div className="card-pad">
        <div className="h-section mb-3">Fault categories</div>
        {s.categories.length ? <div className="space-y-2">{s.categories.map((c) => <Category key={c.id} c={c} total={s.tickets} />)}</div> : <p className="text-sm text-mute">No faults found in the reviews so far.</p>}
      </div>
    </div>
  );
}

export default async function Patterns({ searchParams }: { searchParams: Promise<{ dev?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const lead = atLeast(me.access, "LEAD");
  // A developer only ever sees their own; anything else falls back to it.
  const dev = sp.dev && canViewPatterns(me, sp.dev) ? sp.dev : lead ? "team" : me.id;
  const a = await loadAnalysis();
  const mine = a.devs.find((d) => d.developerId === dev);
  const empty: PatternSummary = { reviews: 0, tickets: 0, enough: false, firstTryPassRate: null, avgRounds: null, avgFirstPassScore: null, trend: "unknown", trendDetail: null, categories: [], focus: [], strengths: [], byMonth: [] };
  const s = dev === "team" ? a.team : mine ?? empty;
  const q = `dev=${encodeURIComponent(dev)}`;

  return (
    <div className="space-y-6">
      <PageHeader title={dev === "team" ? "Team review patterns" : dev === me.id ? "My review patterns" : `Review patterns: ${mine?.name ?? "developer"}`}
        sub="What Claude's code reviews keep flagging, whether it is getting better, and what to focus on. A tool for growth, not a score."
        actions={<>
          <Link href="/reports" className="btn"><ArrowLeft size={14} /> Reports</Link>
          {s.tickets > 0 && <><a href={`/api/reports/patterns?${q}&format=pdf`} className="btn"><Download size={14} /> PDF</a><a href={`/api/reports/patterns?${q}&format=pptx`} className="btn"><Download size={14} /> PowerPoint</a></>}</>} />
      <p className="text-xs text-mute">{lead ? "Visible to leads, admins and the developer concerned. " : "Only you and your leads can see this. "}Based on full Claude reviews of pull requests linked to tickets assigned to the developer; heuristic scans and manual checklists are not counted.</p>
      {lead && (
        <div className="flex flex-wrap gap-1.5" aria-label="Choose whose patterns to view">
          <Link href="/reports/patterns?dev=team" className={clsx("rounded-md border px-2.5 py-1 text-xs", dev === "team" ? "border-neon/60 bg-neon/10 text-ink" : "border-line text-mute hover:text-ink")}>Team</Link>
          {a.devs.map((d) => <Link key={d.developerId} href={`/reports/patterns?dev=${d.developerId}`} className={clsx("rounded-md border px-2.5 py-1 text-xs", dev === d.developerId ? "border-neon/60 bg-neon/10 text-ink" : "border-line text-mute hover:text-ink")}>{d.name}</Link>)}
        </div>)}
      {dev === "team" && a.byProject.length > 1 && (
        <div className="card-pad"><div className="h-section mb-2">By project</div>
          <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm"><thead className="text-left text-xs uppercase tracking-wider text-mute"><tr><th className="py-1">Project</th><th>PRs</th><th>Passed first try</th><th>Most common</th></tr></thead>
            <tbody>{a.byProject.map((p) => <tr key={p.project} className="border-t border-line/60"><td className="py-2 font-mono">{p.project}</td><td className="font-mono">{p.tickets}</td><td className="font-mono">{pct(p.firstTryPassRate)}</td><td>{p.top[0]?.label ?? "-"}</td></tr>)}</tbody></table></div></div>)}
      <Body s={s} subject={dev === "team" ? "team" : "developer"} />
    </div>
  );
}
