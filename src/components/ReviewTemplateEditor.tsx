"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CheckCircle2, CircleDashed, Plus, Save, Trash2 } from "lucide-react";
import { saveReviewConfigAction } from "@/app/(app)/actions";
import type { ReviewConfig, TemplateItem } from "@/lib/review-config";

type Group = { guidance: string; items: TemplateItem[] };

function Items({ items, onChange }: { items: TemplateItem[]; onChange: (i: TemplateItem[]) => void }) {
  const set = (id: string, p: Partial<TemplateItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...p } : i)));
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.id} className={clsx("flex flex-col gap-2 rounded-lg border border-line bg-panel2 p-3 sm:flex-row sm:items-center", !i.enabled && "opacity-60")}>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="h-5 w-5 accent-[#6ee7ff]" checked={i.enabled} onChange={(e) => set(i.id, { enabled: e.target.checked })} /> On</label>
          <input className="input" aria-label="Checklist point" value={i.label} onChange={(e) => set(i.id, { label: e.target.value })} />
          <select className="input sm:w-36" aria-label="Severity" value={i.severity} onChange={(e) => set(i.id, { severity: e.target.value as TemplateItem["severity"] })}><option value="critical">Critical</option><option value="important">Important</option></select>
          <button className="btn-ghost p-2" aria-label="Remove point" onClick={() => onChange(items.filter((x) => x.id !== i.id))}><Trash2 size={15} /></button>
        </li>))}
      {!items.length && <li className="text-sm text-mute">No points yet.</li>}
    </ul>
  );
}
const newItem = (): TemplateItem => ({ id: "c" + Math.random().toString(36).slice(2, 9), label: "", severity: "important", enabled: true });

export function ReviewTemplateEditor({ initial, projects, status }: { initial: ReviewConfig; projects: { key: string; name: string }[]; status: { claude: boolean; github: boolean; model: string } }) {
  const [cfg, setCfg] = useState(initial);
  const [proj, setProj] = useState(projects[0]?.key ?? "");
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const pg: Group = cfg.projects[proj] ?? { guidance: "", items: [] };
  const setProject = (g: Group) => setCfg({ ...cfg, projects: { ...cfg.projects, [proj]: g } });
  const Status = ({ ok, label, hint }: { ok: boolean; label: string; hint: string }) => <li className="flex items-start gap-2 text-xs">{ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-neon-lime" /> : <CircleDashed size={14} className="mt-0.5 shrink-0 text-neon-amber" />}<span><code className="text-ink">{label}</code> <span className="text-mute">{ok ? "set" : "not set"} · {hint}</span></span></li>;

  return (
    <div className="space-y-6">
      {msg && <div role="status" className={clsx("rounded-lg border px-4 py-2 text-sm", msg.bad ? "border-neon-red/40 text-neon-red" : "border-neon-lime/30 text-neon-lime")}>{msg.t}</div>}

      <div className="card-pad space-y-4">
        <div className="h-section">How reviews run</div>
        <ul className="space-y-1.5">
          <Status ok={status.claude} label="ANTHROPIC_API_KEY" hint={status.claude ? `Claude (${status.model}) reviews the diff` : "without it only a heuristic diff scan runs, not an AI review"} />
          <Status ok={status.github} label="GITHUB_TOKEN" hint="needed to read the PR diff (and to comment on the PR if enabled)" />
        </ul>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#6ee7ff]" checked={cfg.autoRun} onChange={(e) => setCfg({ ...cfg, autoRun: e.target.checked })} /><span>Run automatically when a card with a PR moves to Initial Review, and again when new commits are pushed to that PR.<span className="block text-xs text-mute">Push re-runs need the GitHub webhook (pull_request events). A failing review blocks the move to Review either way.</span></span></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#6ee7ff]" checked={cfg.postToPr} onChange={(e) => setCfg({ ...cfg, postToPr: e.target.checked })} /><span>Also post the result as a comment on the pull request.<span className="block text-xs text-mute">The GitHub token needs write access to pull requests.</span></span></label>
      </div>

      <div className="card-pad space-y-4">
        <div className="h-section">Team checklist (every project)</div>
        <p className="text-xs text-mute">Critical points must pass before a card can move to Review. Important points are reported but don't block.</p>
        <Items items={cfg.global.items} onChange={(items) => setCfg({ ...cfg, global: { ...cfg.global, items } })} />
        <button className="btn" onClick={() => setCfg({ ...cfg, global: { ...cfg.global, items: [...cfg.global.items, newItem()] } })}><Plus size={14} /> Add point</button>
        <label className="block"><span className="label">Extra guidance for Claude (optional)</span>
          <textarea className="input min-h-[96px]" maxLength={4000} placeholder="e.g. We use Laravel; flag raw DB queries without bindings. Prefer small PRs." value={cfg.global.guidance} onChange={(e) => setCfg({ ...cfg, global: { ...cfg.global, guidance: e.target.value } })} /></label>
      </div>

      <div className="card-pad space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="h-section">Project-specific points</div>
          <select className="input sm:w-64" aria-label="Project" value={proj} onChange={(e) => setProj(e.target.value)}>{projects.map((p) => <option key={p.key} value={p.key}>{p.key} · {p.name}</option>)}</select>
        </div>
        <p className="text-xs text-mute">Added to the team checklist for {proj || "this project"} only, with their own critical / important severity.</p>
        <Items items={pg.items} onChange={(items) => setProject({ ...pg, items })} />
        <button className="btn" disabled={!proj} onClick={() => setProject({ ...pg, items: [...pg.items, newItem()] })}><Plus size={14} /> Add project point</button>
        <label className="block"><span className="label">Guidance for {proj || "this project"} (optional)</span>
          <textarea className="input min-h-[80px]" maxLength={4000} placeholder="Architecture notes, conventions, risky areas…" value={pg.guidance} onChange={(e) => setProject({ ...pg, guidance: e.target.value })} /></label>
      </div>

      <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
        const r = await saveReviewConfigAction(cfg);
        setMsg(r.ok ? { t: "Review template saved. It applies to the next review run." } : { t: r.error, bad: true });
        router.refresh();
      })}><Save size={14} /> Save review template</button>
    </div>
  );
}
