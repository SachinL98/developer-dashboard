// How long a ticket should take, learned from how long this person's earlier tickets of the same size took. Pure (no database).
import { hoursForPoints } from "./workflow";

export interface PacePoint { points: number; actualHrs: number }
export interface FinishSuggestion {
  hours: number; basis: "personal-same-size" | "personal-per-point" | "team-per-point" | "estimate" | "default";
  hoursPerPoint: number | null; samples: number; note: string;
}

const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const half = (n: number) => Math.max(0.5, Math.round(n * 2) / 2);
const usable = (xs: PacePoint[]) => xs.filter((x) => x.points > 0 && x.actualHrs >= 0.25);

/**
 * Suggested hours to finish. For a pointed ticket: this person's own median for the same number of points (at least 3 tickets),
 * else their median hours per point, else the team's, else the ticket's own estimate, else a standard 2.5 hours per point.
 * An unpointed ticket uses its estimate. Returns null when there is nothing to go on.
 */
export function suggestFinishHours(t: { points: number | null; estimateHrs: number | null }, mine: PacePoint[], team: PacePoint[] = []): FinishSuggestion | null {
  const my = usable(mine), tm = usable(team);
  if (t.points && t.points > 0) {
    const same = my.filter((x) => x.points === t.points);
    if (same.length >= 3) { const h = median(same.map((x) => x.actualHrs)); return { hours: half(h), basis: "personal-same-size", hoursPerPoint: Math.round((h / t.points) * 10) / 10, samples: same.length, note: `Your ${same.length} earlier ${t.points}-point tickets took ${Math.round(h * 10) / 10}h in the middle.` }; }
    if (my.length >= 3) { const hpp = median(my.map((x) => x.actualHrs / x.points)); return { hours: half(hpp * t.points), basis: "personal-per-point", hoursPerPoint: Math.round(hpp * 10) / 10, samples: my.length, note: `Your usual pace is ${Math.round(hpp * 10) / 10}h per point over ${my.length} tickets.` }; }
    if (tm.length >= 5) { const hpp = median(tm.map((x) => x.actualHrs / x.points)); return { hours: half(hpp * t.points), basis: "team-per-point", hoursPerPoint: Math.round(hpp * 10) / 10, samples: tm.length, note: `Not enough of your own history yet, so this uses the team's ${Math.round(hpp * 10) / 10}h per point.` }; }
    if (t.estimateHrs && t.estimateHrs > 0) return { hours: half(t.estimateHrs), basis: "estimate", hoursPerPoint: null, samples: 0, note: "From the ticket's estimate (no finished tickets to learn from yet)." };
    return { hours: half(hoursForPoints(t.points)), basis: "default", hoursPerPoint: 2.5, samples: 0, note: "A standard 2.5h per point until there is history to learn from." };
  }
  if (t.estimateHrs && t.estimateHrs > 0) return { hours: half(t.estimateHrs), basis: "estimate", hoursPerPoint: null, samples: 0, note: "From the ticket's estimate." };
  return null;
}

export interface Countdown { targetSec: number; trackedSec: number; remainingSec: number; over: boolean; pctUsed: number; state: "ok" | "soon" | "over" }
/** Time left against the suggestion. `soon` means under 20% is left. */
export function countdownOf(targetHrs: number, trackedSec: number): Countdown {
  const targetSec = Math.round(targetHrs * 3600);
  const remainingSec = targetSec - trackedSec;
  const pctUsed = targetSec ? Math.round((trackedSec / targetSec) * 100) : 0;
  return { targetSec, trackedSec, remainingSec, over: remainingSec < 0, pctUsed, state: remainingSec < 0 ? "over" : remainingSec <= targetSec * 0.2 ? "soon" : "ok" };
}
export const fmtClock = (sec: number) => { const s = Math.abs(Math.round(sec)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(x).padStart(2, "0")}s`; };
