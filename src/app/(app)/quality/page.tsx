import { requireUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { db } from "@/lib/db";
import { aiKeyFor } from "@/lib/ai";
import { loadQuality, latestQualityInsight, QUALITY_SPRINTS } from "@/lib/quality";
import { PageHeader, Avatar, Empty } from "@/components/ui";
import { QualityActions } from "@/components/QualityActions";
import { OriginPicker } from "@/components/OriginPicker";
import { LineSeries } from "@/components/Charts";
import { PRIORITY_META } from "@/lib/workflow";
import { fg } from "@/lib/theme";
import { Download } from "lucide-react";

export const dynamic = "force-dynamic";

const CAUSE = { requirements: "Unclear requirements", implementation: "Implementation", testing: "Test coverage", review: "Review", integration: "Integration", environment: "Environment", unknown: "Not clear" } as const;
const VERDICT = { confirmed: "Confirmed", plausible: "Plausible", unrelated: "Probably unrelated" } as const;

export default async function Quality() {
  const me = await requireUser();
  const lead = atLeast(me.access, "LEAD");
  const [{ links, stats, confirmed }, insight, ai, devs] = await Promise.all([
    loadQuality(), latestQualityInsight(), aiKeyFor(me.id),
    db.developer.findMany({ select: { id: true, name: true, avatarHue: true, avatarVer: true } }),
  ]);
  const dev = new Map(devs.map((d) => [d.id, d]));
  // Per-person results are for that person, leads and admins. Everyone else only ever gets the team-level numbers.
  const visibleLinks = links.filter((l) => l.candidates[0] && (lead || l.candidates[0].origin.assigneeId === me.id));
  const people = stats.perDev.filter((p) => lead || p.developerId === me.id);
  const canAnswer = (l: { bug: { assigneeId: string | null } }) => lead || l.bug.assigneeId === me.id;
  const unmatched = links.filter((l) => !l.candidates.length && canAnswer(l));
  const judged = new Map((insight?.judgements ?? []).map((j) => [j.bugKey, j]));
  const notes = new Map((insight?.people ?? []).filter((p) => lead || p.developerId === me.id).map((p) => [p.developerId, p]));

  return (
    <div className="space-y-6">
      <PageHeader title="Quality" sub={`Where bugs found in later sprints seem to come from, across the last ${QUALITY_SPRINTS} sprints. It is a way to find and fix causes, not to assign blame.`} actions={<><QualityActions hasInsight={!!insight} aiReady={!!ai} /><a href="/api/reports/export?kind=quality&format=pptx" className="btn"><Download size={14} /> PowerPoint</a><a href="/api/reports/export?kind=quality&format=pdf" className="btn"><Download size={14} /> PDF</a></>} />

      {!stats.bugsTotal ? <Empty>No bug tickets in the last sprints yet. Once bugs are logged, this page links them back to the earlier work they probably come from.</Empty> : (<>
        <section className="card-pad">
          <div className="grid gap-4 sm:grid-cols-3">
            <div><div className="text-xs text-mute">Bugs in the last {QUALITY_SPRINTS} sprints</div><div className="mt-1 text-2xl font-semibold tabular-nums">{stats.bugsTotal}</div></div>
            <div><div className="text-xs text-mute">Traced to earlier work</div><div className="mt-1 text-2xl font-semibold tabular-nums">{stats.bugsTraced}<span className="text-base font-normal text-mute"> · {stats.tracedPct}%</span></div></div>
            <div><div className="text-xs text-mute">Traced bugs per 10 delivered tickets</div><div className="mt-1 text-2xl font-semibold tabular-nums">{stats.teamBugsPer10 ?? "n/a"}</div></div>
          </div>
          {stats.bySprint.length > 1 && (
            <div className="mt-5"><div className="mb-1 text-xs font-medium text-mute">Bugs logged and tickets delivered, sprint by sprint</div>
              <LineSeries data={stats.bySprint.map((s) => ({ name: s.sprint, bugs: s.bugs, delivered: s.delivered }))} lines={[{ key: "bugs", color: "#fb7185", name: "Bugs logged" }, { key: "delivered", color: "#6366f1", name: "Delivered" }]} /></div>)}
          {stats.bySprint.length > 0 && (
            <div className="mt-5 overflow-x-auto"><table className="tbl min-w-[420px]"><thead><tr><th>Sprint</th><th>Delivered</th><th>Bugs logged</th></tr></thead>
              <tbody>{stats.bySprint.map((s) => <tr key={s.sprint}><td>{s.sprint}</td><td className="tabular-nums">{s.delivered}</td><td className="tabular-nums">{s.bugs}</td></tr>)}</tbody></table></div>)}
          {stats.recurringAreas.length > 0 ? <div className="mt-4 rounded-lg bg-neon-amber/10 px-3 py-2 text-sm text-neon-amber">Recurring across sprints: {stats.recurringAreas.map((a) => `${a.label} (${a.bugs} bugs in ${a.sprints} sprints)`).join(", ")}.</div> : <p className="mt-4 text-sm text-neon-lime">No area is producing repeated bugs. A few bugs here and there is normal.</p>}
          <p className="mt-3 text-xs text-mute">Matches are based on the bug naming a ticket, shared labels and similar wording, so they are suggestions to check, not proof. A bug can also come from unclear requirements or a missed test, not only from the code.</p>
        </section>

        {insight && (insight.patterns.length > 0 || insight.processSuggestions.length > 0) && (
          <section className="grid gap-6 lg:grid-cols-2">
            {insight.patterns.length > 0 && <div className="card-pad"><h2 className="mb-2 text-sm font-semibold">Patterns the AI noticed</h2><ul className="list-disc space-y-1.5 pl-5 text-sm">{insight.patterns.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            {insight.processSuggestions.length > 0 && <div className="card-pad"><h2 className="mb-2 text-sm font-semibold">What would help the whole team</h2><ul className="list-disc space-y-1.5 pl-5 text-sm">{insight.processSuggestions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            <p className="text-xs text-mute lg:col-span-2">Written by AI ({insight.model}) on {new Date(insight.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} from ticket titles, descriptions, labels and dates. Confidence: {insight.confidence}. Treat it as a starting point for a conversation.</p>
          </section>)}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{lead ? "By developer" : "Your work"}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {people.map((p) => {
              const d = dev.get(p.developerId); const n = notes.get(p.developerId);
              return (
                <div key={p.developerId} className="card-pad space-y-3">
                  <div className="flex items-center gap-3">
                    {d && <Avatar name={d.name} hue={d.avatarHue} id={d.id} ver={d.avatarVer} size={36} />}
                    <div className="min-w-0 flex-1"><div className="truncate font-medium">{d?.name ?? "Developer"}</div><div className="text-xs text-mute">{p.delivered} delivered · {p.bugsTraced} bug{p.bugsTraced === 1 ? "" : "s"} traced{p.likelyBugs ? ` (${p.likelyBugs} likely)` : ""}</div></div>
                    <span className={`pill ${p.pattern === "recurring" ? "bg-neon-amber/10 text-neon-amber" : p.pattern === "none" ? "bg-neon-lime/10 text-neon-lime" : "bg-panel2 text-mute"}`}>{p.pattern === "recurring" ? "Recurring pattern" : p.pattern === "occasional" ? "Occasional, normal" : "No traced bugs"}</span>
                  </div>
                  {p.pattern === "recurring" && <p className="rounded-lg bg-neon-amber/10 px-3 py-2 text-xs text-neon-amber">{p.bugsTraced} traced bugs across {p.bugSprints} sprints{p.recurringAreas.length ? `, repeating in ${p.recurringAreas.join(", ")}` : ""}. Worth a supportive conversation.</p>}
                  {p.pattern === "occasional" && <p className="text-xs text-mute">One or two traced bugs is normal and not a concern on its own. It only matters if it keeps coming back.</p>}
                  {p.areas.length > 0 && <div className="flex flex-wrap gap-1.5 text-xs">{p.areas.map((a) => <span key={a.topic} className="chip">{a.label} · {a.bugs}</span>)}</div>}
                  {n ? (<div className="space-y-2 text-sm">
                    <p>{n.summary}</p>
                    {n.strengths.length > 0 && <div><div className="text-xs font-medium text-neon-lime">Going well</div><ul className="list-disc pl-5">{n.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
                    {n.watchFor.length > 0 && <div><div className="text-xs font-medium text-neon-amber">Worth watching</div><ul className="list-disc pl-5">{n.watchFor.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
                    {n.suggestions.length > 0 && <div><div className="text-xs font-medium text-mute">Suggestions</div><ul className="list-disc pl-5">{n.suggestions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
                  </div>) : <p className="text-xs text-mute">Run the AI analysis for a written summary.</p>}
                </div>);
            })}
            {!people.length && <Empty>No delivered tickets with an assignee yet.</Empty>}
          </div>
        </section>

        <section className="card overflow-x-auto">
          <div className="p-5 pb-2"><h2 className="text-sm font-semibold">Bugs and where they probably come from</h2><p className="mt-1 text-xs text-mute">{lead ? "Each bug with the earlier ticket it most likely comes from." : "Bugs that probably come from tickets you delivered."}</p></div>
          <table className="tbl min-w-[760px]">
            <thead><tr><th>Bug</th><th>Probable origin</th>{lead && <th>Built by</th>}<th>Match</th><th>Why</th><th>Which ticket caused it?</th></tr></thead>
            <tbody>
              {visibleLinks.map((l) => {
                const c = l.candidates[0]; const j = judged.get(l.bug.key); const by = c.origin.assigneeId ? dev.get(c.origin.assigneeId) : null;
                return (
                  <tr key={l.bug.key} className="align-top">
                    <td><div className="font-mono text-xs text-mute">{l.bug.key} · {l.bug.sprintName}</div><div>{l.bug.title}</div><div className="text-xs" style={{ color: fg(PRIORITY_META[l.bug.priority as keyof typeof PRIORITY_META]?.color ?? "#64748b") }}>{PRIORITY_META[l.bug.priority as keyof typeof PRIORITY_META]?.label ?? l.bug.priority}</div></td>
                    <td><div className="font-mono text-xs text-mute">{c.origin.key} · {c.origin.sprintName}</div><div>{c.origin.title}</div><div className="text-xs text-mute">{c.gapDays} days before the bug</div></td>
                    {lead && <td className="whitespace-nowrap">{by?.name ?? "n/a"}</td>}
                    <td><span className={`pill ${j?.verdict === "unrelated" ? "bg-panel2 text-mute" : c.confidence === "likely" || j?.verdict === "confirmed" ? "bg-neon-amber/10 text-neon-amber" : "bg-panel2 text-mute"}`}>{j ? VERDICT[j.verdict] : c.confidence === "likely" ? "Likely" : "Possible"}</span>{j && j.rootCause !== "unknown" && <div className="mt-1 text-xs text-mute">{CAUSE[j.rootCause]}</div>}</td>
                    <td className="max-w-xs text-xs text-mute">{j?.reason ?? c.signals.map((s) => s.detail).join(" · ")}</td>
                    <td className="min-w-[200px]">{canAnswer(l) ? <OriginPicker bugKey={l.bug.key} confirmed={confirmed.get(l.bug.key) ?? null} suggestions={l.candidates.slice(0, 3).map((x) => ({ key: x.origin.key, title: x.origin.title }))} /> : <span className="text-xs text-mute">{confirmed.get(l.bug.key) ? "Confirmed" : ""}</span>}</td>
                  </tr>);
              })}
              {!visibleLinks.length && <tr><td colSpan={lead ? 6 : 5} className="py-8 text-center text-mute">{lead ? "No bug could be traced to earlier work yet." : "No bugs have been traced to your tickets. Nice."}</td></tr>}
            </tbody>
          </table>
        </section>

        {unmatched.length > 0 && (
          <section className="card-pad">
            <h2 className="text-sm font-semibold">Bugs with no clear origin yet</h2>
            <p className="mb-3 mt-1 text-xs text-mute">If you know which ticket one of these came from, say so and it joins the picture. Adding the ticket key in the bug (or linking the issues in Jira) also helps.</p>
            <ul className="divide-y divide-line/70">
              {unmatched.slice(0, 15).map((l) => (
                <li key={l.bug.key} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0"><span className="font-mono text-xs text-mute">{l.bug.key} · {l.bug.sprintName}</span> {l.bug.title}</div>
                  <OriginPicker bugKey={l.bug.key} confirmed={null} suggestions={[]} />
                </li>))}
            </ul>
          </section>)}
      </>)}
    </div>
  );
}
