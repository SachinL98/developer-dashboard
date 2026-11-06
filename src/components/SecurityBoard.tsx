"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, ShieldAlert, Sparkles, Settings2 } from "lucide-react";
import { generateSecurityBriefAction, refreshSecurityAction, saveSecurityConfigAction, securityToTicketAction } from "@/app/(app)/actions";

export interface BoardItem {
  id: string; cve: string | null; title: string; summary: string; severity: "critical" | "high" | "medium" | "low" | "unknown"; cvss: number | null; exploited: boolean; ransomware: boolean;
  source: "github" | "cisa"; published: string; url: string; why: string | null; action: string | null; packages: { name: string; range: string | null; fixedIn: string | null }[];
}
export interface BriefView { summary: string; topActions: string[]; generatedAt: string; model: string; items: Record<string, { meaning: string; affects: string; fixSteps: string[]; urgency: "now" | "this_week" | "watch" }> }

const SEV = { critical: "bg-neon-red/10 text-neon-red", high: "bg-neon-amber/10 text-neon-amber", medium: "bg-panel2 text-ink", low: "bg-panel2 text-mute", unknown: "bg-panel2 text-mute" } as const;
const URG = { now: ["Act now", "bg-neon-red/10 text-neon-red"], this_week: ["This week", "bg-neon-amber/10 text-neon-amber"], watch: ["Keep an eye on it", "bg-panel2 text-mute"] } as const;
const ECO = ["composer", "npm", "pip", "maven", "go", "nuget", "rubygems", "rust"];
const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** The security notice board: recent global vulnerabilities that matter to our stack, with an AI explanation and fix steps. */
export function SecurityBoard(p: { items: BoardItem[]; brief: BriefView | null; fetchedAt: string | null; errors: string[]; aiReady: boolean; canLead: boolean; isAdmin: boolean; projectId: string | null; cfg: { ecosystems: string[]; keywords: string[] } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ t: string; bad?: boolean } | null>(null);
  const [edit, setEdit] = useState(false);
  const [all, setAll] = useState(false);
  const shown = all ? p.items : p.items.slice(0, 3);
  const [eco, setEco] = useState(p.cfg.ecosystems);
  const [kw, setKw] = useState(p.cfg.keywords.join(", "));
  const run = (fn: () => Promise<{ ok: boolean; error?: string } & Record<string, any>>, ok?: string) => start(async () => { const r = await fn(); setNote(r.ok ? (ok ? { t: ok } : null) : { t: r.error ?? "Failed", bad: true }); router.refresh(); });

  return (
    <section id="security" className="card-pad scroll-mt-20">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert size={16} className="text-neon-red" /> Security notice board</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn h-8 px-2.5 text-xs" disabled={pending} onClick={() => run(async () => { const r = await refreshSecurityAction(); if (r.ok && r.errors.length) setNote({ t: `Some sources failed: ${r.errors.join("; ").slice(0, 160)}`, bad: true }); return r; })}>{pending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh</button>
          <button className="btn-primary h-8 px-2.5 text-xs" disabled={pending || !p.aiReady || !p.items.length} title={p.aiReady ? "" : "Add an AI key in Settings"} onClick={() => run(() => generateSecurityBriefAction(), "Explained")}><Sparkles size={13} /> {p.brief ? "Explain again" : "Explain with AI"}</button>
          {p.isAdmin && <button className="btn-ghost h-8 px-2 text-xs" onClick={() => setEdit((e) => !e)} aria-label="What the board watches"><Settings2 size={14} /></button>}
        </div>
      </div>
      <p className="mb-3 text-xs text-mute">Recent security issues published worldwide that touch {p.cfg.ecosystems.join(", ") || "your"} packages or software we use, plus anything attackers are exploiting right now (CISA). {p.fetchedAt ? `Updated ${when(p.fetchedAt)}.` : "Not loaded yet. Press Refresh."}</p>
      {note && <p role="status" className={clsx("mb-3 text-xs", note.bad ? "text-neon-red" : "text-neon-lime")}>{note.t}</p>}

      {edit && p.isAdmin && (
        <div className="mb-4 space-y-3 rounded-xl border border-line p-4 text-sm">
          <div><div className="label">Package ecosystems to watch</div><div className="flex flex-wrap gap-3">{ECO.map((e) => <label key={e} className="flex items-center gap-1.5"><input type="checkbox" checked={eco.includes(e)} onChange={(x) => setEco(x.target.checked ? [...eco, e] : eco.filter((y) => y !== e))} />{e}</label>)}</div></div>
          <div><label className="label">Software keywords (matched against exploited vulnerabilities)</label><input className="input" value={kw} onChange={(e) => setKw(e.target.value)} /></div>
          <button className="btn-primary" disabled={pending} onClick={() => run(async () => { const r = await saveSecurityConfigAction({ ecosystems: eco, keywords: kw.split(",").map((s) => s.trim()).filter(Boolean) }); if (r.ok) { await refreshSecurityAction(); setEdit(false); } return r; }, "Saved and refreshed")}>Save and refresh</button>
        </div>)}

      {p.brief && (
        <div className="mb-4 rounded-xl bg-neon/5 p-4 text-sm">
          <p>{p.brief.summary}</p>
          {p.brief.topActions.length > 0 && <ol className="mt-2 list-decimal space-y-1 pl-5">{p.brief.topActions.map((a, i) => <li key={i}>{a}</li>)}</ol>}
          <p className="mt-2 text-[11px] text-mute">Explained by AI ({p.brief.model}) from the notices below. It does not know about anything else, so check the linked advisory before acting.</p>
        </div>)}

      {p.items.length ? (
        <ul className="divide-y divide-line/70">
          {shown.map((a) => {
            const b = p.brief?.items[a.id];
            return (
              <li key={a.id} className="py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={clsx("pill", SEV[a.severity])}>{a.severity === "unknown" ? "Unrated" : a.severity[0].toUpperCase() + a.severity.slice(1)}{a.cvss ? ` ${a.cvss}` : ""}</span>
                  {a.exploited && <span className="pill bg-neon-red/10 text-neon-red"><AlertTriangle size={11} /> Exploited now</span>}
                  {a.ransomware && <span className="pill bg-neon-red/10 text-neon-red">Used by ransomware</span>}
                  {b && <span className={clsx("pill", URG[b.urgency][1])}>{URG[b.urgency][0]}</span>}
                  <span className="text-xs text-mute">{a.cve ?? a.id} · {when(a.published)}{a.why ? ` · ${a.why}` : ""}</span>
                </div>
                <a href={a.url} target="_blank" rel="noreferrer" className="mt-1 flex items-start gap-1 text-sm font-medium hover:underline">{a.title}<ExternalLink size={12} className="mt-1 shrink-0 text-mute" /></a>
                {a.packages.length > 0 && <div className="mt-1 text-xs text-mute">{a.packages.slice(0, 3).map((x) => `${x.name}${x.range ? ` ${x.range}` : ""}${x.fixedIn ? ` → fixed in ${x.fixedIn}` : ""}`).join(" · ")}</div>}
                {b ? (
                  <div className="mt-2 space-y-1.5 text-sm">
                    <p>{b.meaning}</p>
                    {b.affects && <p className="text-mute">{b.affects}</p>}
                    {b.fixSteps.length > 0 && <ul className="list-disc space-y-0.5 pl-5">{b.fixSteps.map((s, i) => <li key={i}>{s}</li>)}</ul>}
                  </div>
                ) : a.action && <p className="mt-1 text-xs text-mute">CISA says: {a.action}</p>}
                {p.canLead && p.projectId && <button className="btn mt-2 h-7 px-2 text-xs" disabled={pending} onClick={() => run(async () => { const r = await securityToTicketAction(a.id, p.projectId!); if (r.ok) setNote({ t: `Created ${r.key} in the backlog` }); return r; })}>Create a ticket</button>}
              </li>);
          })}
        </ul>
      ) : <p className="py-4 text-sm text-mute">{p.fetchedAt ? "No recent notices match your stack. That is good news." : "Press Refresh to load the latest notices."}</p>}
      {p.items.length > 3 && <button className="btn mt-3 h-8 text-xs" onClick={() => setAll((x) => !x)}>{all ? "Show fewer" : `Show ${p.items.length - 3} more`}</button>}
      {p.errors.length > 0 && <p className="mt-2 text-[11px] text-neon-amber">Some sources could not be reached last time: {p.errors.join("; ").slice(0, 200)}</p>}
    </section>
  );
}
