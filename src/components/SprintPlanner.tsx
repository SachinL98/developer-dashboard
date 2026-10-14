"use client";
import Link from "next/link";
import { fg, tint } from "@/lib/theme";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { GripVertical, Flame, Wand2, Rocket, Flag, X, Plus, CalendarOff } from "lucide-react";
import { assignToSprintAction, autoFillSprintAction, closeSprintAction, createSprintAction, reorderAction, startSprintAction } from "@/app/(app)/actions";
import { PRIORITY_META, TYPE_META } from "@/lib/workflow";
import { Progress } from "./ui";

export interface PlanTicket { id: string; key: string; title: string; type: keyof typeof TYPE_META; priority: keyof typeof PRIORITY_META; points: number | null; estimateHrs: number | null; complicated: boolean; project: string; assignee: string | null }
export interface PlanSprint { id: string; name: string; goal: string | null; state: string; start: string; end: string }
export interface Fit { capacityHrs: number; committedHrs: number; loadPct: number; fits: boolean; overBy: number }

export function SprintPlanner({ sprints, selected, backlog, inSprint, fit, perDev, canManage, newSprint, leave, forecast }: { leave: { lostHrs: number; leaveDays: number; holidayDays: number; fullHrs: number } | null; forecast: Record<string, { finish: string | null; late: boolean }>; newSprint: { name: string; start: string; end: string }; canManage: boolean; sprints: PlanSprint[]; selected: PlanSprint | null; backlog: PlanTicket[]; inSprint: PlanTicket[]; fit: Fit | null; perDev: { name: string; hrs: number; cap: number; leaveDays: number }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [list, setList] = useState(backlog);
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: newSprint.name, goal: "", start: newSprint.start, end: newSprint.end });
  const say = (t: string, bad = false) => setMsg({ t, bad });
  const run = (fn: () => Promise<any>, ok?: (r: any) => string) => start(async () => { const r = await fn(); r.ok ? say(ok?.(r) ?? "Done") : say(r.error, true); router.refresh(); });

  function reorder(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = list.findIndex((t) => t.id === dragId), to = list.findIndex((t) => t.id === targetId);
    const next = [...list]; const [m] = next.splice(from, 1); next.splice(to, 0, m);
    setList(next); run(() => reorderAction(next.map((t) => t.id)), () => "Priority order saved");
  }
  const sprintOpen = canManage && selected && selected.state !== "CLOSED";

  return (
    <div className="space-y-6">
      <div className="card-pad">
        <div className="flex flex-wrap items-center gap-2">
          {sprints.map((s) => (
            <Link key={s.id} href={`/sprints?sprint=${s.id}`} className={clsx("rounded-lg border px-3 py-1.5 text-sm", s.id === selected?.id ? "border-neon/60 bg-neon/10 text-ink" : "border-line text-mute hover:text-ink")}>
              {s.name} <span className="ml-1 text-[10px] uppercase tracking-wider opacity-70">{s.state.toLowerCase()}</span>
            </Link>
          ))}
          {canManage && <button className="btn ml-auto" onClick={() => setShowNew((v) => !v)}><Plus size={14} /> New sprint</button>}
        </div>
        {showNew && (
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <input className="input" placeholder="Sprint 26" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input md:col-span-2" placeholder="Goal" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
            <input type="date" className="input" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            <div className="flex gap-2"><input type="date" className="input" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
              <button className="btn-primary" disabled={pending || !form.name || !form.start || !form.end} onClick={() => run(() => createSprintAction(form), () => "Sprint created")}>Add</button></div>
          </div>
        )}
      </div>

      {msg && <div className={clsx("rounded-lg border px-4 py-2 text-sm", msg.bad ? "border-neon-red/40 text-neon-red" : "border-neon-lime/30 text-neon-lime")}>{msg.t}</div>}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card-pad">
          <div className="mb-1 flex items-center justify-between"><span className="h-section">Backlog · priority order</span><span className="text-xs text-mute">{list.length} tickets</span></div>
          <p className="mb-3 text-xs text-mute">{canManage ? "Drag to prioritise (saved immediately). Drop onto the sprint to commit, or use +." : "Read-only: leads and admins plan the sprint."}</p>
          <ul className="space-y-1.5">
            {list.map((t) => (
              <li key={t.id} draggable={canManage} onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOver(null); }} onDragOver={(e) => { e.preventDefault(); setOver(t.id); }} onDrop={() => { reorder(t.id); setOver(null); }}
                className={clsx("group flex items-center gap-2 rounded-lg border bg-panel2 px-2 py-2 text-sm", over === t.id ? "border-neon" : "border-line")}>
                <GripVertical size={14} className="cursor-grab text-mute" />
                <span style={{ color: fg(PRIORITY_META[t.priority].color) }}>▲</span>
                <Link href={`/tickets/${t.id}`} className="min-w-0 flex-1 break-words hover:text-ink sm:truncate"><span className="font-mono text-xs text-mute">{t.key}</span> {t.title}</Link>
                {t.complicated && <Flame size={13} className="text-neon-amber" aria-label="Groom" />}
                <span className="hidden rounded px-1.5 text-[10px] sm:inline" style={{ color: fg(TYPE_META[t.type].color), background: tint(TYPE_META[t.type].color, 10) }}>{TYPE_META[t.type].label}</span>
                <span className="w-10 text-right font-mono text-xs text-mute">{t.estimateHrs != null ? `${t.estimateHrs}h` : "—"}</span>
                {sprintOpen && <button className="btn-ghost px-2 py-0.5 [@media(hover:none)]:px-3.5 [@media(hover:none)]:py-2" title="Add to sprint" disabled={pending} onClick={() => run(() => assignToSprintAction(t.id, selected!.id), () => `${t.key} added`)}>+</button>}
              </li>
            ))}
            {!list.length && <li className="py-6 text-center text-sm text-mute">Backlog is empty.</li>}
          </ul>
        </div>

        <div className={clsx("card-pad transition", dragId && sprintOpen && "border-neon shadow-glow")} onDragOver={(e) => sprintOpen && e.preventDefault()} onDrop={() => { if (dragId && sprintOpen) { const t = list.find((x) => x.id === dragId); run(() => assignToSprintAction(dragId, selected!.id), () => `${t?.key} added to ${selected!.name}`); } setDragId(null); }}>
          {selected ? (<>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="text-lg font-semibold">{selected.name}</div><div className="text-xs text-mute">{selected.goal} · {new Date(selected.start).toLocaleDateString("en-GB")} → {new Date(selected.end).toLocaleDateString("en-GB")}</div></div>
              <div className="flex gap-2">
                {canManage && selected.state === "PLANNING" && <>
                  <button className="btn" disabled={pending} onClick={() => run(() => autoFillSprintAction(selected.id), (r) => `Added ${r.added} by priority; ${r.skipped} didn't fit`)}><Wand2 size={14} /> Auto-fill</button>
                  <button className="btn-primary" disabled={pending} onClick={() => run(() => startSprintAction(selected.id), (r) => `Sprint started. ${r.moved} cards moved to Ready to Dev`)}><Rocket size={14} /> Start sprint</button></>}
                {canManage && selected.state === "ACTIVE" && <button className="btn" disabled={pending} onClick={() => confirm("Close sprint? Unfinished cards roll into the next planning sprint in their current column.") && run(() => closeSprintAction(selected.id), (r) => `Sprint closed. ${r.carried} cards carried over`)}><Flag size={14} /> Close sprint</button>}
              </div>
            </div>
            {fit && (
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs"><span className="text-mute">Committed {fit.committedHrs}h of {fit.capacityHrs}h usable capacity</span><span className={fit.fits ? "text-neon-lime" : "text-neon-red"}>{fit.loadPct}%{fit.fits ? "" : ` · over by ${fit.overBy}h`}</span></div>
                <Progress pct={fit.loadPct} color={fit.loadPct > 100 ? "#fb7185" : fit.loadPct > 85 ? "#fbbf24" : "#a3e635"} />
                {leave && (leave.lostHrs > 0) && <p className="mt-2 flex items-start gap-1.5 text-xs text-neon-amber"><CalendarOff size={13} className="mt-0.5 shrink-0" /><span>Leave and holidays take {leave.lostHrs}h out of {leave.fullHrs}h ({leave.leaveDays} leave day{leave.leaveDays === 1 ? "" : "s"}{leave.holidayDays ? `, ${leave.holidayDays} public holiday${leave.holidayDays === 1 ? "" : "s"} per person` : ""}). <Link href="/leave" className="underline">See the team calendar</Link></span></p>}
              </div>
            )}
            {perDev.length > 0 && <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2">{perDev.map((d) => (
              <div key={d.name}><div className="flex justify-between text-[11px] text-mute"><span>{d.name.split(" ")[0]}{d.leaveDays > 0 && <span className="ml-1 text-neon-amber" title="Approved leave in this sprint">· {d.leaveDays}d off</span>}</span><span>{d.hrs}/{d.cap}h</span></div><Progress pct={d.cap ? (d.hrs / d.cap) * 100 : d.hrs ? 100 : 0} color={d.hrs > d.cap ? "#fb7185" : "#6ee7ff"} /></div>))}</div>}
            <ul className="mt-5 space-y-1.5">
              {inSprint.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-lg border border-line bg-panel2 px-3 py-2 text-sm">
                  <span style={{ color: fg(PRIORITY_META[t.priority].color) }}>▲</span>
                  <Link href={`/tickets/${t.id}`} className="min-w-0 flex-1 break-words hover:text-ink sm:truncate"><span className="font-mono text-xs text-mute">{t.key}</span> {t.title}</Link>
                  {t.complicated && <Flame size={13} className="text-neon-amber" />}
                  {forecast[t.id]?.late && <span className="chip border-neon-red/40 text-neon-red" title="At the assignee's pace, with their leave and public holidays, this finishes after the sprint ends">At risk{forecast[t.id].finish ? ` · ~${forecast[t.id].finish!.slice(5)}` : ""}</span>}
                  {t.points != null && <span className="rounded bg-line px-1.5 font-mono text-xs">{t.points}</span>}
                  <span className={clsx("w-14 whitespace-nowrap text-right font-mono text-xs", t.estimateHrs == null ? "text-neon-red" : "text-mute")}>{t.estimateHrs != null ? `${t.estimateHrs}h` : "no est."}</span>
                  {canManage && selected.state === "PLANNING" && <button className="rounded p-1 text-mute hover:text-neon-red [@media(hover:none)]:p-2.5" aria-label="Remove from sprint" onClick={() => run(() => assignToSprintAction(t.id, null), () => `${t.key} returned to backlog`)}><X size={14} /></button>}
                </li>
              ))}
              {!inSprint.length && <li className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-mute">Drop backlog tickets here.</li>}
            </ul>
          </>) : <p className="text-sm text-mute">Create a sprint to start planning.</p>}
        </div>
      </div>
    </div>
  );
}
