export interface HistoryPoint { type: string; points: number | null; estimateHrs: number | null; actualHrs: number }

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const roundHalf = (n: number) => Math.round(n * 2) / 2;

export interface Suggestion { hours: number; low: number; high: number; confidence: "low" | "medium" | "high"; basis: string; samples: number }

/** Suggest hours from similar finished tickets (same type & points), falling back to hours-per-point. */
export function suggestEstimate(
  input: { type: string; points: number | null; complicated?: boolean },
  history: HistoryPoint[],
): Suggestion {
  const done = history.filter((h) => h.actualHrs > 0);
  const similar = done.filter((h) => h.type === input.type && input.points != null && h.points === input.points);
  const samePts = done.filter((h) => input.points != null && h.points === input.points);
  const pool = similar.length >= 3 ? similar : samePts.length >= 3 ? samePts : [];
  const bump = input.complicated ? 1.25 : 1;

  if (pool.length) {
    const xs = pool.map((h) => h.actualHrs);
    const hrs = median(xs) * bump;
    return {
      hours: roundHalf(hrs), low: roundHalf(Math.min(...xs)), high: roundHalf(Math.max(...xs) * bump),
      confidence: pool.length >= 6 ? "high" : "medium", samples: pool.length,
      basis: `${pool.length} finished ${similar.length >= 3 ? input.type.toLowerCase() + " " : ""}tickets at ${input.points} pts (median actual)`,
    };
  }
  const perPoint = done.filter((h) => h.points).map((h) => h.actualHrs / (h.points as number));
  const ratio = perPoint.length ? median(perPoint) : 3; // ~3h per point when we know nothing
  const pts = input.points ?? 3;
  return {
    hours: roundHalf(ratio * pts * bump), low: roundHalf(ratio * pts * 0.6), high: roundHalf(ratio * pts * 1.6 * bump),
    confidence: "low", samples: perPoint.length,
    basis: perPoint.length ? `${ratio.toFixed(1)}h per story point across ${perPoint.length} tickets` : "No history yet — default 3h per story point",
  };
}

export interface PokerSummary { count: number; median: number; min: number; max: number; consensus: boolean; spread: number }
export function summarisePoker(votes: number[]): PokerSummary {
  if (!votes.length) return { count: 0, median: 0, min: 0, max: 0, consensus: false, spread: 0 };
  const m = median(votes), min = Math.min(...votes), max = Math.max(...votes);
  return { count: votes.length, median: m, min, max, spread: max / Math.max(min, 0.5), consensus: max / Math.max(min, 0.5) <= 2 };
}

export interface FitResult { capacityHrs: number; committedHrs: number; loadPct: number; fits: boolean; overBy: number }
export function sprintFit(capacityHrs: number, estimates: (number | null)[], bufferPct = 15): FitResult {
  const committed = estimates.reduce<number>((a, b) => a + (b ?? 0), 0);
  const usable = capacityHrs * (1 - bufferPct / 100);
  return {
    capacityHrs: Math.round(usable * 10) / 10, committedHrs: committed,
    loadPct: usable ? Math.round((committed / usable) * 100) : 0, fits: committed <= usable, overBy: Math.max(0, Math.round((committed - usable) * 10) / 10),
  };
}

/** Greedy fill: take tickets in priority order while they fit the capacity; skip (don't stop) on oversize. */
export function fillSprint<T extends { id: string; estimateHrs: number | null }>(ordered: T[], capacityHrs: number, bufferPct = 15) {
  const usable = capacityHrs * (1 - bufferPct / 100);
  let used = 0;
  const take: T[] = [], leave: T[] = [];
  for (const t of ordered) {
    const e = t.estimateHrs ?? 0;
    if (used + e <= usable) { used += e; take.push(t); } else leave.push(t);
  }
  return { take, leave, used };
}
