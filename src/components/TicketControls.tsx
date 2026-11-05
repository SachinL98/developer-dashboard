"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, ArrowRight, Save } from "lucide-react";
import { moveTicketAction, setProgressAction, startTimerAction, stopTimerAction, updateTicketAction } from "@/app/(app)/actions";
import { STATUS_META, allowedNext, STORY_POINTS, type StatusKey } from "@/lib/workflow";

export function TicketControls(p: {
  id: string; status: StatusKey; progress: number; timerRunning: boolean; assigneeId: string | null; devs: { id: string; name: string }[];
  canLead: boolean; prUrl: string | null; points: number | null; estimateHrs: number | null; sprintId: string | null; sprints: { id: string; name: string }[];
}) {
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [pct, setPct] = useState(p.progress);
  const [note, setNote] = useState("");
  const [pr, setPr] = useState(p.prUrl ?? "");
  const [est, setEst] = useState(p.estimateHrs?.toString() ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string } & Record<string, any>>, ok?: string) =>
    start(async () => { const r = await fn(); setMsg(r.ok ? { t: ok ?? "Saved" } : { t: (r as any).error, bad: true }); router.refresh(); });

  return (
    <div className="space-y-5">
      <div>
        <div className="label">Move card</div>
        <div className="flex flex-wrap gap-2">
          {allowedNext(p.status).map((n) => (
            <button key={n} disabled={pending} className={n === "FAILED_STG" ? "btn border-neon-red/40 text-neon-red" : "btn-primary"} onClick={() => run(() => moveTicketAction(p.id, n), `Moved to ${STATUS_META[n].label}`)}>
              <ArrowRight size={14} /> {STATUS_META[n].label}
            </button>
          ))}
          {!allowedNext(p.status).length && <span className="text-sm text-mute">Final column. Nothing further.</span>}
        </div>
      </div>

      {p.status === "IN_PROGRESS" && (
        <div className="space-y-2">
          <div className="label">Implementation progress · {pct}%</div>
          <input type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(+e.target.value)} className="w-full accent-[rgb(var(--neon-violet))]" />
          <div className="flex gap-2">
            <input className="input" placeholder="What changed? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn" disabled={pending} onClick={() => run(() => setProgressAction(p.id, pct, note), "Progress logged")}><Save size={14} /> Log</button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {p.timerRunning
          ? <button className="btn border-neon-red/40" disabled={pending} onClick={() => run(() => stopTimerAction(), "Timer stopped")}><Square size={14} /> Stop timer</button>
          : <button className="btn" disabled={pending || p.status !== "IN_PROGRESS"} title={p.status !== "IN_PROGRESS" ? "Timers run on In Progress cards" : ""} onClick={() => run(() => startTimerAction(p.id), "Timer started")}><Play size={14} /> Start timer</button>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Assignee</label>
          <select className="input" disabled={!p.canLead} title={p.canLead ? "" : "Leads assign tickets"} value={p.assigneeId ?? ""} onChange={(e) => run(() => updateTicketAction(p.id, { assigneeId: e.target.value || null }))}>
            <option value="">Unassigned</option>{p.devs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select></div>
        <div><label className="label">Story points</label>
          <select className="input" value={p.points ?? ""} onChange={(e) => run(() => updateTicketAction(p.id, { storyPoints: e.target.value ? +e.target.value : null }))}>
            <option value="">—</option>{STORY_POINTS.map((s) => <option key={s}>{s}</option>)}
          </select></div>
        <div><label className="label">Estimate (hours)</label>
          <div className="flex gap-2"><input className="input" inputMode="decimal" value={est} onChange={(e) => setEst(e.target.value)} />
            <button className="btn" onClick={() => run(() => updateTicketAction(p.id, { estimateHrs: est ? +est : null }))}><Save size={14} /></button></div></div>
        <div><label className="label">Sprint</label>
          <select className="input" disabled={!p.canLead} value={p.sprintId ?? ""} onChange={async (e) => { const { assignToSprintAction } = await import("@/app/(app)/actions"); run(() => assignToSprintAction(p.id, e.target.value || null)); }}>
            <option value="">Backlog</option>{p.sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>
      </div>
      <div><label className="label">Pull request URL</label>
        <div className="flex gap-2"><input className="input" placeholder="https://github.com/org/repo/pull/123" value={pr} onChange={(e) => setPr(e.target.value)} />
          <button className="btn" onClick={() => run(() => updateTicketAction(p.id, { prUrl: pr || null }), "PR linked")}><Save size={14} /></button></div></div>
      {msg && <div className={`text-sm ${msg.bad ? "text-neon-red" : "text-neon-lime"}`}>{msg.t}</div>}
    </div>
  );
}
