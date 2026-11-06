// Delivery signals: sprint health, tickets stuck in a column, and how a person's estimates compare with what happened. Pure.

export type HealthLevel = "on_track" | "at_risk" | "behind";
/** Done share of the sprint against the share of working time used. 8 points of slack is on track, 25 is at risk, beyond that is behind. */
export function sprintHealth(donePct: number, elapsedPct: number): { level: HealthLevel; label: string } {
  if (donePct + 8 >= elapsedPct) return { level: "on_track", label: "On track" };
  if (donePct + 25 >= elapsedPct) return { level: "at_risk", label: "At risk" };
  return { level: "behind", label: "Behind" };
}

/** Why a sprint looks risky, in plain words. Empty when there is nothing to say. */
export function sprintRiskReasons(i: { donePct: number; elapsedPct: number; daysLeft: number; blocked: number; stuck: number; unestimated: number; failedStaging: number }): string[] {
  const out: string[] = [];
  const h = sprintHealth(i.donePct, i.elapsedPct);
  if (h.level !== "on_track") out.push(`${Math.round(i.donePct)}% of tickets are done with ${Math.round(i.elapsedPct)}% of the working time used and ${i.daysLeft} working day${i.daysLeft === 1 ? "" : "s"} left`);
  if (i.blocked) out.push(`${i.blocked} ticket${i.blocked === 1 ? " is" : "s are"} blocked`);
  if (i.stuck) out.push(`${i.stuck} ticket${i.stuck === 1 ? " has" : "s have"} waited 2+ working days in review or staging`);
  if (i.failedStaging) out.push(`${i.failedStaging} failed in staging`);
  if (i.unestimated) out.push(`${i.unestimated} ticket${i.unestimated === 1 ? " has" : "s have"} no estimate`);
  return out;
}

/** Whole working days (Monday to Friday) that have passed since `since`, not counting the day it started. */
export function workdaysSince(since: Date, now: Date): number {
  let n = 0;
  const d = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (d.setUTCDate(d.getUTCDate() + 1); d.getTime() <= end; d.setUTCDate(d.getUTCDate() + 1)) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

export const WAITING_STATUSES = ["INITIAL_REVIEW", "REVIEW", "FAILED_STG"];
export interface StuckInput { key: string; title: string; status: string; assigneeId: string | null; since: Date }
/** Tickets that have sat in a review or staging column for `minWorkdays` or more working days. */
export function stuckTickets<T extends StuckInput>(tickets: T[], now: Date, minWorkdays = 2): (T & { days: number })[] {
  return tickets.filter((t) => WAITING_STATUSES.includes(t.status)).map((t) => ({ ...t, days: workdaysSince(t.since, now) })).filter((t) => t.days >= minWorkdays).sort((a, b) => b.days - a.days);
}

export interface CalRow { points: number; tickets: number; estimateHrs: number; actualHrs: number; ratio: number | null }
export interface Calibration { rows: CalRow[]; overall: number | null; tickets: number; bias: "under" | "over" | "balanced" | "not enough data" }
/**
 * How a person's estimates compare with the time they took, by story-point size.
 * ratio = actual ÷ estimate: above 1 means the work usually takes longer than estimated.
 */
export function calibration(done: { points: number | null; estimateHrs: number | null; actualHrs: number }[]): Calibration {
  const usable = done.filter((t) => t.points != null && t.points > 0 && t.estimateHrs != null && t.estimateHrs > 0 && t.actualHrs > 0);
  const by = new Map<number, typeof usable>();
  usable.forEach((t) => by.set(t.points!, [...(by.get(t.points!) ?? []), t]));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const rows = [...by].sort((a, b) => a[0] - b[0]).map(([points, xs]) => {
    const e = xs.reduce((s, t) => s + t.estimateHrs!, 0), a = xs.reduce((s, t) => s + t.actualHrs, 0);
    return { points, tickets: xs.length, estimateHrs: r2(e / xs.length), actualHrs: r2(a / xs.length), ratio: xs.length >= 2 ? r2(a / e) : null };
  });
  const E = usable.reduce((s, t) => s + t.estimateHrs!, 0), A = usable.reduce((s, t) => s + t.actualHrs, 0);
  const overall = usable.length >= 3 ? r2(A / E) : null;
  return { rows, overall, tickets: usable.length, bias: overall == null ? "not enough data" : overall >= 1.2 ? "under" : overall <= 0.8 ? "over" : "balanced" };
}
