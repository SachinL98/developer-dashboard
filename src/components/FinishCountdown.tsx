"use client";
import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import clsx from "clsx";
import { countdownOf, fmtClock } from "@/lib/finish-time";

/**
 * A countdown to the suggested finish time. `trackedSec` is the time already logged on the ticket; when a timer is running
 * (`runningSince`) the clock keeps counting down live. It turns amber near the end and shows how far over once past it.
 */
export function FinishCountdown({ targetHrs, trackedSec, runningSince, note, compact = false }: { targetHrs: number; trackedSec: number; runningSince?: string | null; note?: string; compact?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (!runningSince) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [runningSince]);
  const live = runningSince && now ? Math.max(0, Math.floor((now - new Date(runningSince).getTime()) / 1000)) : 0;
  const c = countdownOf(targetHrs, trackedSec + live);
  const tone = c.state === "over" ? "text-neon-red" : c.state === "soon" ? "text-neon-amber" : "text-ink";
  const bar = c.state === "over" ? "bg-neon-red" : c.state === "soon" ? "bg-neon-amber" : "bg-neon";
  return (
    <div className={clsx("rounded-lg border border-line", compact ? "p-2" : "p-3")} aria-live="off">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-mute"><Timer size={13} className={runningSince ? "text-neon" : ""} /> {compact ? "To finish" : "Suggested time to finish"} <b className="font-medium text-ink">{Math.round(targetHrs * 10) / 10}h</b></span>
        <span className={clsx("font-semibold tabular-nums", tone, compact ? "text-sm" : "text-lg")}>{c.over ? `over by ${fmtClock(-c.remainingSec)}` : `${fmtClock(c.remainingSec)} left`}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"><div className={clsx("h-full rounded-full transition-all", bar)} style={{ width: `${Math.min(100, c.pctUsed)}%` }} /></div>
      {!compact && note && <p className="mt-1.5 text-xs text-mute">{note}{c.over ? " It has run past the suggestion: worth a quick word with your lead if the scope has grown." : ""}</p>}
    </div>
  );
}
