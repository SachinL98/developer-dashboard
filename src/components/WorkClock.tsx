"use client";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Play, Square, LogIn, LogOut, X } from "lucide-react";
import { clockInAction, clockOutAction, stopTimerAction } from "@/app/(app)/actions";
import { fmtDur } from "@/lib/time";

export type DayCard = { id: string; key: string; title: string };

/** Start / end of day check-in: tick the cards, add an optional message. */
function CheckIn({ mode, cards, preselected, onClose }: { mode: "start" | "end"; cards: DayCard[]; preselected: string[]; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>(preselected);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isStart = mode === "start";
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const submit = () => start(async () => {
    const r = await (isStart ? clockInAction : clockOutAction)({ ticketIds: picked, note });
    if (r.ok) onClose(); else setErr(r.error ?? "Something went wrong");
  });
  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="card w-full max-w-lg space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{isStart ? "Start your day" : "End your day"}</h2>
            <p className="text-sm text-mute">{isStart ? "Which tickets are you working on today?" : "Which tickets did you work on today?"}</p>
          </div>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {cards.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm hover:bg-panel2">
              <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--neon))]" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
              <span className="shrink-0 text-xs text-mute">{c.key}</span><span className="truncate">{c.title}</span>
            </label>
          ))}
          {!cards.length && <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-mute">No tickets are assigned to you right now.</p>}
        </div>
        <div>
          <label className="label" htmlFor="daynote">{isStart ? "Message (optional)" : "Summary (optional)"}</label>
          <textarea id="daynote" className="input min-h-[88px]" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={isStart ? "Anything your team should know about today?" : "What got done? Anything blocked or left for tomorrow?"} />
        </div>
        {err && <p className="text-sm text-neon-red">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={pending} onClick={submit}>{isStart ? "Start day" : "End day"}</button>
        </div>
      </div>
    </div>, document.body);
}

export function WorkClock({ sessionStart, timer, targetHrs, cards = [], planned = [] }: { targetHrs?: number; sessionStart: string | null; timer: { key: string; title: string; startedAt: string } | null; cards?: DayCard[]; planned?: string[] }) {
  const [dialog, setDialog] = useState<"start" | "end" | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const nowMs = now ?? new Date(sessionStart ?? 0).getTime();
  const secs = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":"); };
  return (
    <div className="card space-y-3 p-3">
      {dialog && <CheckIn mode={dialog} cards={cards} preselected={dialog === "end" ? planned : []} onClose={() => setDialog(null)} />}
      <div className="flex items-center justify-between">
        <span className="h-section">Work day</span>
        {sessionStart && <span className="live-dot h-2 w-2 rounded-full bg-neon-lime" />}
      </div>
      {sessionStart ? (
        <>
          <div className="font-semibold tabular-nums text-xl">{secs(nowMs - new Date(sessionStart).getTime())}{targetHrs ? <span className="ml-1 text-xs text-mute">/ {targetHrs}h</span> : null}</div>
          {targetHrs ? <div className="h-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-neon" style={{ width: `${Math.min(100, ((nowMs - new Date(sessionStart).getTime()) / 3_600_000 / targetHrs) * 100)}%` }} /></div> : null}
          <button className="btn w-full" disabled={pending} onClick={() => setDialog("end")}><LogOut size={14} /> End day</button>
        </>
      ) : (
        <button className="btn-primary w-full" disabled={pending} onClick={() => setDialog("start")}><LogIn size={14} /> Start day</button>
      )}
      {timer && (
        <div className="rounded-lg border border-neon/25 bg-neon/5 p-2">
          <div className="flex items-center justify-between text-[11px] text-mute"><span className="text-neon">{timer.key}</span><span>{fmtDur((now ?? new Date(timer.startedAt).getTime()) - new Date(timer.startedAt).getTime())}</span></div>
          <div className="mt-0.5 truncate text-xs">{timer.title}</div>
          <button className="btn mt-2 w-full" disabled={pending} onClick={() => start(async () => { await stopTimerAction(); })}><Square size={12} /> Stop</button>
        </div>
      )}
    </div>
  );
}
export { Play };
