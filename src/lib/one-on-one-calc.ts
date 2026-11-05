// The numbers behind a 1:1 report: the last two weeks against the 30 days before. Pure (no database), so it is unit tested.

export const WINDOW_DAYS = 14;
export const BASELINE_DAYS = 30;

export interface PeriodFacts {
  label: string; days: number;
  ticketsDone: number; pointsDone: number; ticketsInFlight: number; bugsFixed: number;
  hoursWorked: number; hoursTracked: number; daysWorked: number; avgStartMin: number | null; leaveDays: number;
  cycleDays: number | null; estimateAccuracy: number | null; stagingFailures: number;
  reviewFirstPassPct: number | null; reviewRounds: number | null;
  meetingsSpoke: number; talkMin: number; talkSharePct: number | null;
}

export type Trend = "better" | "worse" | "same" | "n/a";
export interface ScoreRow { key: string; label: string; unit: string; cur: number | null; base: number | null; deltaPct: number | null; trend: Trend; note?: string }

const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (cur: number, base: number) => (base === 0 ? (cur === 0 ? 0 : null) : Math.round(((cur - base) / Math.abs(base)) * 100));

interface Def { key: keyof PeriodFacts | "trackedPct"; label: string; unit: string; kind: "count" | "ratio"; good: "up" | "down" | "none" | "toward1"; value?: (f: PeriodFacts) => number | null }
const DEFS: Def[] = [
  { key: "ticketsDone", label: "Tickets finished", unit: "", kind: "count", good: "up" },
  { key: "pointsDone", label: "Story points finished", unit: "pts", kind: "count", good: "up" },
  { key: "bugsFixed", label: "Bugs fixed", unit: "", kind: "count", good: "none" },
  { key: "hoursWorked", label: "Hours worked", unit: "h", kind: "count", good: "none" },
  { key: "trackedPct", label: "Time tracked on tickets", unit: "%", kind: "ratio", good: "up", value: (f) => (f.hoursWorked > 0 ? Math.round((f.hoursTracked / f.hoursWorked) * 100) : null) },
  { key: "daysWorked", label: "Days worked", unit: "", kind: "count", good: "none" },
  { key: "cycleDays", label: "Average days from start to done", unit: "d", kind: "ratio", good: "down" },
  { key: "estimateAccuracy", label: "Estimate accuracy (actual ÷ estimate)", unit: "×", kind: "ratio", good: "toward1" },
  { key: "stagingFailures", label: "Failed staging deploys", unit: "", kind: "count", good: "down" },
  { key: "reviewFirstPassPct", label: "Pull requests passing review first time", unit: "%", kind: "ratio", good: "up" },
  { key: "reviewRounds", label: "Review rounds per ticket", unit: "", kind: "ratio", good: "down" },
  { key: "meetingsSpoke", label: "Meetings spoken in", unit: "", kind: "count", good: "up" },
  { key: "talkSharePct", label: "Share of meeting talk time", unit: "%", kind: "ratio", good: "none" },
];

/** Counts are compared per two weeks (the earlier period is longer), ratios as they are. A change under 10% counts as steady. */
export function buildScorecard(cur: PeriodFacts, base: PeriodFacts | null): ScoreRow[] {
  const scale = base ? (cur.days || WINDOW_DAYS) / (base.days || BASELINE_DAYS) : 1;
  return DEFS.map((d): ScoreRow => {
    const get = (f: PeriodFacts) => (d.value ? d.value(f) : (f[d.key as keyof PeriodFacts] as number | null));
    const c = get(cur);
    const b0 = base ? get(base) : null;
    const b = b0 == null ? null : d.kind === "count" ? r1(b0 * scale) : b0;
    if (c == null || b == null) return { key: d.key, label: d.label, unit: d.unit, cur: c == null ? null : r1(c * (d.key === "estimateAccuracy" ? 100 : 1)) / (d.key === "estimateAccuracy" ? 100 : 1), base: b, deltaPct: null, trend: "n/a" };
    const dp = pct(c, b);
    const small = dp != null && Math.abs(dp) < 10;
    let trend: Trend = "same";
    if (!small && d.good !== "none") {
      if (d.good === "up") trend = c > b ? "better" : "worse";
      else if (d.good === "down") trend = c < b ? "better" : "worse";
      else trend = Math.abs(c - 1) < Math.abs(b - 1) ? "better" : "worse";
    } else if (dp == null && d.good !== "none") trend = d.good === "down" ? (c < b ? "better" : "worse") : "better"; // base was zero
    return { key: d.key, label: d.label, unit: d.unit, cur: r1(c), base: r1(b), deltaPct: dp, trend };
  });
}

const show = (r: ScoreRow, v: number | null) => (v == null ? "n/a" : `${v}${r.unit === "%" ? "%" : r.unit === "×" ? "×" : r.unit ? " " + r.unit : ""}`);

/** Plain statements of what clearly got better or worse, without any AI. A change must be at least 15%. */
export function findings(rows: ScoreRow[]): { improved: string[]; attention: string[] } {
  const line = (r: ScoreRow) => `${r.label}: ${show(r, r.base)} → ${show(r, r.cur)}${r.deltaPct != null ? ` (${r.deltaPct > 0 ? "+" : ""}${r.deltaPct}%)` : ""}`;
  const big = (r: ScoreRow) => r.deltaPct == null || Math.abs(r.deltaPct) >= 15;
  return { improved: rows.filter((r) => r.trend === "better" && big(r)).map(line), attention: rows.filter((r) => r.trend === "worse" && big(r)).map(line) };
}

/** The 14-day window ending now and the 30 days before it. */
export function windows(now: Date) {
  const day = 86_400_000;
  const end = now.getTime();
  return { cur: { start: new Date(end - WINDOW_DAYS * day), end: now }, base: { start: new Date(end - (WINDOW_DAYS + BASELINE_DAYS) * day), end: new Date(end - WINDOW_DAYS * day) } };
}

/** "2026-11" in the team timezone. */
export const monthKeyOf = (d: Date, tz = "UTC") => d.toLocaleDateString("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).slice(0, 7);
/** Day of the month (1-31) in the team timezone: the 1:1 reports are made in the first week. */
export const dayOfMonth = (d: Date, tz = "UTC") => +d.toLocaleDateString("en-CA", { timeZone: tz, day: "2-digit" });
export const inFirstWeek = (d: Date, tz = "UTC") => dayOfMonth(d, tz) <= 7;
