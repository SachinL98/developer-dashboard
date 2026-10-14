"use client";
import { useEffect, useState, useTransition } from "react";
import { fg, tint } from "@/lib/theme";
import { useRouter } from "next/navigation";
import { Sparkles, Plus, ListPlus } from "lucide-react";
import clsx from "clsx";
import { bulkCreateAction, createTicketAction, previewBulkAction, suggestEstimateAction } from "@/app/(app)/actions";
import { STORY_POINTS, TYPE_META, PRIORITY_META } from "@/lib/workflow";
import { DESCRIPTION_TEMPLATES } from "@/lib/ticket-parse";

type Opt = { id: string; name: string };
type Sug = Awaited<ReturnType<typeof suggestEstimateAction>>;

export function TicketForm({ projects, devs, sprints, jira }: { projects: Opt[]; devs: Opt[]; sprints: Opt[]; jira: boolean }) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ projectId: projects[0]?.id ?? "", title: "", description: DESCRIPTION_TEMPLATES.TASK, type: "TASK", priority: "MEDIUM", points: "", estimate: "", assigneeId: "", sprintId: "", complicated: false, labels: "", push: jira });
  const [sug, setSug] = useState<Sug | null>(null);
  const [res, setRes] = useState<{ text: string; bad?: boolean } | null>(null);
  const [bulk, setBulk] = useState("[bug] Checkout button unresponsive on iOS Safari !high #frontend (3)\nAdd CSV export to audit log\nImprove report query speed #db");
  const [prev, setPrev] = useState<Awaited<ReturnType<typeof previewBulkAction>>>([]);
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => { suggestEstimateAction({ type: f.type, points: f.points ? +f.points : null, complicated: f.complicated }).then(setSug); }, [f.type, f.points, f.complicated]);
  useEffect(() => { const t = setTimeout(() => previewBulkAction(bulk).then(setPrev), 200); return () => clearTimeout(t); }, [bulk]);

  const submit = () => start(async () => {
    const r = await createTicketAction({
      projectId: f.projectId, title: f.title, description: f.description, type: f.type as any, priority: f.priority as any,
      storyPoints: f.points ? +f.points : null, estimateHrs: f.estimate ? +f.estimate : null, assigneeId: f.assigneeId || null, sprintId: f.sprintId || null,
      complicated: f.complicated, labels: f.labels.split(",").map((s) => s.trim()).filter(Boolean), pushToJira: f.push,
    });
    if (r.ok) { setRes({ text: `Created ${r.key}${r.jiraError ? " (Jira push failed: " + r.jiraError.slice(0, 100) + ")" : f.push ? " and pushed to Jira" : ""}` }); router.push("/board"); } else setRes({ text: r.error, bad: true });
  });

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="card-pad space-y-4 xl:col-span-2">
        <div className="flex gap-1 rounded-lg border border-line bg-bg/50 p-1 w-fit">
          {(["single", "bulk"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={clsx("flex items-center gap-1.5 rounded-md px-3 py-1 text-sm", mode === m ? "bg-line text-ink" : "text-mute")}>{m === "single" ? <Plus size={14} /> : <ListPlus size={14} />}{m === "single" ? "Single ticket" : "Quick capture (bulk)"}</button>)}
        </div>
        <div><label className="label">Project</label><select className="input" value={f.projectId} onChange={(e) => set("projectId", e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>

        {mode === "single" ? (
          <>
            <div><label className="label">Title</label><input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Short, specific, verb-first" /></div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div><label className="label">Type</label><select className="input" value={f.type} onChange={(e) => { set("type", e.target.value); set("description", DESCRIPTION_TEMPLATES[e.target.value as keyof typeof DESCRIPTION_TEMPLATES]); }}>{Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
              <div><label className="label">Priority</label><select className="input" value={f.priority} onChange={(e) => set("priority", e.target.value)}>{Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
              <div><label className="label">Story points</label><select className="input" value={f.points} onChange={(e) => set("points", e.target.value)}><option value="">—</option>{STORY_POINTS.map((p) => <option key={p}>{p}</option>)}</select></div>
              <div><label className="label">Estimate (h)</label><input className="input" inputMode="decimal" value={f.estimate} onChange={(e) => set("estimate", e.target.value)} /></div>
            </div>
            <div><label className="label">Description</label><textarea className="input min-h-[200px] font-mono text-[13px]" value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
            <div className="grid gap-3 md:grid-cols-3">
              <div><label className="label">Assignee</label><select className="input" value={f.assigneeId} onChange={(e) => set("assigneeId", e.target.value)}><option value="">Unassigned</option>{devs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
              <div><label className="label">Sprint</label><select className="input" value={f.sprintId} onChange={(e) => set("sprintId", e.target.value)}><option value="">Backlog</option>{sprints.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
              <div><label className="label">Labels</label><input className="input" placeholder="backend, db" value={f.labels} onChange={(e) => set("labels", e.target.value)} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm text-mute"><input type="checkbox" checked={f.complicated} onChange={(e) => set("complicated", e.target.checked)} /> Complicated — flag for grooming discussion</label>
          </>
        ) : (
          <>
            <div><label className="label">One ticket per line</label>
              <textarea className="input min-h-[220px] font-mono text-[13px]" value={bulk} onChange={(e) => setBulk(e.target.value)} />
              <p className="mt-1 text-xs text-mute">Syntax: <code>[bug|feature|enhancement|task]</code> prefix, <code>!high</code>, <code>#label</code>, <code>(3)</code> points. Type and priority are inferred when omitted.</p></div>
            <div className="space-y-1.5">{prev.map((p, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm">
                <span className="rounded px-1.5 text-[11px]" style={{ color: fg(TYPE_META[p.type].color), background: tint(TYPE_META[p.type].color, 10) }}>{TYPE_META[p.type].label}</span>
                <span className="flex-1 truncate">{p.title}</span><span className="text-xs" style={{ color: fg(PRIORITY_META[p.priority].color) }}>{PRIORITY_META[p.priority].label}</span>
                {p.storyPoints && <span className="chip">{p.storyPoints} pts</span>}{(p.labels ?? []).map((l) => <span key={l} className="chip">{l}</span>)}
              </div>))}</div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <label className={clsx("flex items-center gap-2 text-sm", jira ? "text-ink" : "text-mute")}><input type="checkbox" disabled={!jira} checked={f.push} onChange={(e) => set("push", e.target.checked)} /> Create in Jira backlog {jira ? "" : "(Jira not configured)"}</label>
          <button className="btn-primary ml-auto" disabled={pending || (mode === "single" ? !f.title.trim() : !prev.length)}
            onClick={() => mode === "single" ? submit() : start(async () => { const r = await bulkCreateAction(f.projectId, bulk, f.push); setRes(r.ok ? { text: `Created ${r.keys.length}: ${r.keys.join(", ")}${r.errors.length ? " — Jira errors: " + r.errors.join("; ") : ""}` } : { text: r.error, bad: true }); if (r.ok) router.push("/sprints"); })}>
            {mode === "single" ? "Create ticket" : `Create ${prev.length} tickets`}
          </button>
        </div>
        {res && <div className={clsx("text-sm", res.bad ? "text-neon-red" : "text-neon-lime")}>{res.text}</div>}
      </div>

      <div className="space-y-4">
        <div className="card-pad">
          <div className="h-section mb-3 flex items-center gap-2"><Sparkles size={14} className="text-neon-violet" /> Estimate assistant</div>
          {sug ? (<>
            <div className="font-mono text-3xl">{sug.hours}<span className="text-lg text-mute">h</span></div>
            <div className="mt-1 text-xs text-mute">range {sug.low}–{sug.high}h · <span className={sug.confidence === "high" ? "text-neon-lime" : sug.confidence === "medium" ? "text-neon-amber" : "text-neon-red"}>{sug.confidence} confidence</span></div>
            <p className="mt-2 text-xs text-mute">{sug.basis}</p>
            <button className="btn mt-3 w-full" onClick={() => set("estimate", String(sug.hours))}>Use {sug.hours}h</button>
          </>) : <p className="text-sm text-mute">Pick story points to get a suggestion based on your team&apos;s finished tickets.</p>}
        </div>
        <div className="card-pad text-sm text-mute">
          <div className="h-section mb-2">How tickets flow</div>
          Backlog → sprint plan priority → groom if complicated → estimate → Ready to Dev. New tickets always start in <b className="text-ink">Backlog</b>.
        </div>
      </div>
    </div>
  );
}
