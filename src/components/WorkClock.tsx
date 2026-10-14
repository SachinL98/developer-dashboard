"use client";
import { useEffect, useState, useTransition } from "react";
import { Play, Square, LogIn, LogOut } from "lucide-react";
import { clockInAction, clockOutAction, stopTimerAction } from "@/app/(app)/actions";
import { fmtDur } from "@/lib/time";

export function WorkClock({ sessionStart, timer }: { sessionStart: string | null; timer: { key: string; title: string; startedAt: string } | null }) {
  const [now, setNow] = useState<number | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const nowMs = now ?? new Date(sessionStart ?? 0).getTime();
  const secs = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":"); };
  return (
    <div className="card space-y-3 p-3">
      <div className="flex items-center justify-between">
        <span className="h-section">Work day</span>
        {sessionStart && <span className="live-dot h-2 w-2 rounded-full bg-neon-lime" />}
      </div>
      {sessionStart ? (
        <>
          <div className="font-mono text-xl">{secs(nowMs - new Date(sessionStart).getTime())}</div>
          <button className="btn w-full" disabled={pending} onClick={() => start(async () => { await clockOutAction(); })}><LogOut size={14} /> End day</button>
        </>
      ) : (
        <button className="btn-primary w-full" disabled={pending} onClick={() => start(async () => { await clockInAction(); })}><LogIn size={14} /> Start day</button>
      )}
      {timer && (
        <div className="rounded-lg border border-neon-violet/30 bg-neon-violet/10 p-2">
          <div className="flex items-center justify-between text-[11px] text-mute"><span className="font-mono text-neon-violet">{timer.key}</span><span>{fmtDur((now ?? new Date(timer.startedAt).getTime()) - new Date(timer.startedAt).getTime())}</span></div>
          <div className="mt-0.5 truncate text-xs">{timer.title}</div>
          <button className="btn mt-2 w-full" disabled={pending} onClick={() => start(async () => { await stopTimerAction(); })}><Square size={12} /> Stop</button>
        </div>
      )}
    </div>
  );
}
export { Play };
