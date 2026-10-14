// Report and presentation model: period resolution and slide building. Pure (no DB), so it can be unit tested.
import { zonedParts, zonedToUtc } from "./time";

export type ReportKind = "week" | "sprint" | "month";
export const REPORT_KINDS: { kind: ReportKind; label: string; hint: string }[] = [
  { kind: "week", label: "Previous week", hint: "Last full Monday to Sunday. Use it for the Wednesday weekly summary." },
  { kind: "sprint", label: "Previous sprint", hint: "The last closed sprint: committed vs delivered and carry-over. Use it for the Thursday demo." },
  { kind: "month", label: "Previous month", hint: "Last calendar month, week by week." },
];

export interface Period { kind: ReportKind; key: string; label: string; start: Date; end: Date /* exclusive */; sprintId?: string }
export interface SprintLite { id: string; name: string; state: string; startDate: Date; endDate: Date; goal?: string | null }

const DAY = 86_400_000;
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const fmt = (d: Date, tz?: string) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: tz });
const fmtY = (d: Date, tz?: string) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: tz });

/** Resolve a report period. `ref` picks a specific week (Monday, YYYY-MM-DD), month (YYYY-MM) or sprint (id); without it, the previous one. */
export function resolvePeriod(kind: ReportKind, ref: string | undefined, now: Date, sprints: SprintLite[], tz?: string): Period | null {
  if (kind === "sprint") {
    const closed = sprints.filter((s) => s.state === "CLOSED").sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
    const s = (ref && sprints.find((x) => x.id === ref)) || closed[0] || sprints.find((x) => x.state === "ACTIVE");
    if (!s) return null;
    return { kind, key: `sprint:${s.id}`, label: s.name, start: s.startDate, end: new Date(s.endDate.getTime() + DAY), sprintId: s.id };
  }
  if (kind === "month") {
    let y: number, m: number;
    const r = ref?.match(/^(\d{4})-(\d{2})$/);
    if (r) { y = +r[1]; m = +r[2]; } else { const p = zonedParts(now, tz); y = p.y; m = p.m - 1; if (m < 1) { m = 12; y--; } }
    const start = zonedToUtc(y, m, 1, 0, 0, tz), end = zonedToUtc(y, m + 1, 1, 0, 0, tz);
    return { kind, key: `month:${y}-${String(m).padStart(2, "0")}`, label: start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: tz }), start, end };
  }
  let y: number, m: number, d: number;
  const r = ref?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; } else { const p = zonedParts(now, tz); const back = ((p.wd + 6) % 7) + 7; y = p.y; m = p.m; d = p.d - back; }
  const start = zonedToUtc(y, m, d, 0, 0, tz), end = zonedToUtc(y, m, d + 7, 0, 0, tz);
  const k = zonedParts(start, tz);
  return { kind, key: `week:${ymd(k.y, k.m, k.d)}`, label: `${fmt(start, tz)} to ${fmt(new Date(end.getTime() - DAY), tz)}`, start, end };
}

/** The period of the same kind immediately before `p` (used for "vs previous" deltas). */
export function previousPeriod(p: Period, now: Date, sprints: SprintLite[], tz?: string): Period | null {
  if (p.kind === "sprint") {
    const before = sprints.filter((s) => s.state === "CLOSED" && s.endDate.getTime() < p.start.getTime()).sort((a, b) => b.endDate.getTime() - a.endDate.getTime())[0];
    return before ? resolvePeriod("sprint", before.id, now, sprints, tz) : null;
  }
  const probe = new Date(p.start.getTime() - DAY);
  if (p.kind === "week") { const k = zonedParts(probe, tz); const back = (k.wd + 6) % 7; const mon = new Date(Date.UTC(k.y, k.m - 1, k.d - back)); return resolvePeriod("week", ymd(mon.getUTCFullYear(), mon.getUTCMonth() + 1, mon.getUTCDate()), now, sprints, tz); }
  const k = zonedParts(probe, tz); return resolvePeriod("month", `${k.y}-${String(k.m).padStart(2, "0")}`, now, sprints, tz);
}

export interface DeliveredRow { key: string; title: string; type: string; points: number; hours: number; assignee: string | null; project: string }
export interface DevRow { name: string; points: number; tickets: number; hours: number; bugs: number; cycleDays: number | null }
export interface CarryRow { key: string; title: string; status: string; assignee: string | null; points: number }
export interface PeriodStats { points: number; tickets: number; loggedHrs: number; bugsFixed: number; bugsOpened: number; stgDeploys: number; stgFailures: number; cycleDays: number | null }
export interface PlanRow { key: string; title: string; priority: string; points: number | null; hours: number | null; assignee: string | null }
export interface SprintPlan { name: string; goal: string | null; start: Date; end: Date; state: string; rows: PlanRow[]; committedHrs: number; capacityHrs: number; loadPct: number; unestimated: number; unassigned: number; leaveHrs?: number }
export interface MonthPlan { label: string; capacityHrs: number; candidates: PlanRow[]; plannedHrs: number; plannedPts: number; backlogCount: number; carryPts: number; leaveHrs?: number }

export interface ReportFacts {
  period: Period; now: Date; tz?: string;
  stats: PeriodStats; prev: PeriodStats | null; prevLabel: string | null;
  committedPts: number | null; // sprint reports only
  buckets: { label: string; points: number; hours: number }[]; bucketUnit: string;
  velocity: { name: string; committed: number; completed: number }[];
  delivered: DeliveredRow[]; devs: DevRow[]; carry: CarryRow[];
  estimateAccuracy: { avg: number; n: number } | null;
  stale: CarryRow[]; // in progress for a long time
  reviewBlocked: number;
  decisions: string[]; openActions: { text: string; owner: string | null }[];
  nextSprint: SprintPlan | null; nextMonth: MonthPlan;
  leave?: { days: number; holidays: number };
  notes: Record<string, string>;
}

export type Slide = { id: string; title: string; note?: string } & (
  | { layout: "title"; subtitle: string; meta: string[] }
  | { layout: "kpis"; kpis: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "neutral" }[]; bullets: string[] }
  | { layout: "chart"; labels: string[]; series: { name: string; values: number[] }[]; unit: string; caption?: string }
  | { layout: "table"; columns: string[]; rows: string[][]; caption?: string }
  | { layout: "bullets"; bullets: string[]; caption?: string }
);

const r1 = (n: number) => Math.round(n * 10) / 10;
export const pctChange = (cur: number, prev: number | null | undefined) => (prev == null ? null : prev === 0 ? (cur === 0 ? 0 : null) : Math.round(((cur - prev) / prev) * 100));
const vs = (cur: number, prev: number | null | undefined, label: string | null) => {
  const c = pctChange(cur, prev);
  return c == null || !label ? undefined : `${c > 0 ? "+" : ""}${c}% vs ${label}`;
};
const tone = (cur: number, prev: number | null | undefined, higherIsBetter = true): "good" | "bad" | "neutral" => {
  if (prev == null || cur === prev) return "neutral";
  return (cur > prev) === higherIsBetter ? "good" : "bad";
};
const cap = (s: string, n = 70) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const label = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Automatic risks and asks, derived only from the numbers. */
export function risksFor(f: ReportFacts): string[] {
  const out: string[] = [];
  const { stats, prev, nextSprint } = f;
  if (f.committedPts && f.committedPts > 0) {
    const pct = Math.round((stats.points / f.committedPts) * 100);
    if (pct < 80) out.push(`Only ${pct}% of the committed ${f.committedPts} points were delivered. Check whether the sprint was over-committed.`);
  }
  if (prev && prev.points > 0 && stats.points < prev.points * 0.8) out.push(`Delivery dropped ${Math.abs(pctChange(stats.points, prev.points) ?? 0)}% against ${f.prevLabel}.`);
  if (stats.stgFailures > 0) out.push(`${stats.stgFailures} staging failure(s) out of ${stats.stgDeploys} staging deploy(s). Each one sends a card back to In Progress.`);
  if (stats.bugsOpened > stats.bugsFixed) out.push(`More bugs were opened (${stats.bugsOpened}) than fixed (${stats.bugsFixed}); the bug backlog is growing.`);
  if (f.carry.length) out.push(`${f.carry.length} card(s) carry over (${f.carry.reduce((a, c) => a + c.points, 0)} points) and will compete with new work next sprint.`);
  if (f.stale.length) out.push(`${f.stale.length} card(s) have sat in progress for over a week: ${f.stale.slice(0, 3).map((s) => s.key).join(", ")}${f.stale.length > 3 ? "…" : ""}.`);
  if (f.reviewBlocked) out.push(`${f.reviewBlocked} card(s) are blocked by a failing or missing Claude initial review.`);
  if (f.estimateAccuracy && f.estimateAccuracy.n >= 3 && (f.estimateAccuracy.avg > 1.25 || f.estimateAccuracy.avg < 0.75)) out.push(`Estimates are ${f.estimateAccuracy.avg > 1 ? "low" : "high"}: actual time averaged ${Math.round(f.estimateAccuracy.avg * 100)}% of the estimate.`);
  if (nextSprint) {
    if (nextSprint.loadPct > 100) out.push(`${nextSprint.name} is over capacity by ${r1(nextSprint.committedHrs - nextSprint.capacityHrs)}h (${nextSprint.loadPct}% load).`);
    if (nextSprint.unestimated) out.push(`${nextSprint.unestimated} card(s) in ${nextSprint.name} still have no estimate.`);
    if (nextSprint.unassigned) out.push(`${nextSprint.unassigned} card(s) in ${nextSprint.name} have no assignee yet.`);
  } else out.push("No next sprint has been created yet. Create it in the Sprints planner before the Monday planning meeting.");
  return out.length ? out : ["No risks flagged by the numbers this period."];
}

export function buildSlides(f: ReportFacts): Slide[] {
  const { period: p, stats, prev, prevLabel } = f;
  const tz = f.tz;
  const kindName = p.kind === "week" ? "Weekly summary" : p.kind === "sprint" ? "Sprint review" : "Monthly review";
  const slides: Slide[] = [];
  const add = (s: Slide) => slides.push({ ...s, note: f.notes[s.id] || undefined } as Slide);

  add({ id: "title", layout: "title", title: `${kindName}: ${p.label}`, subtitle: "SpaceIT Labs engineering",
    meta: [`${fmtY(p.start, tz)} to ${fmtY(new Date(p.end.getTime() - DAY), tz)}`, `Prepared ${fmtY(f.now, tz)}`] });

  const done = f.committedPts != null ? Math.round((stats.points / Math.max(1, f.committedPts)) * 100) : null;
  const headline: string[] = [
    `${stats.tickets} ticket(s) delivered, ${stats.points} story points${f.committedPts != null ? ` of ${f.committedPts} committed (${done}%)` : ""}.`,
    `${r1(stats.loggedHrs)} hours logged across ${f.devs.filter((d) => d.hours > 0).length} developer(s).`,
  ];
  if (f.leave && (f.leave.days || f.leave.holidays)) headline.push(`${r1(f.leave.days)} leave day(s) and ${f.leave.holidays} public holiday(s) reduced available time${stats.points && f.leave.days + f.leave.holidays ? "; this explains part of any dip in delivery" : ""}.`);
  if (prev && prevLabel) { const c = pctChange(stats.points, prev.points); if (c != null) headline.push(`Delivery is ${c === 0 ? "level with" : `${Math.abs(c)}% ${c > 0 ? "up on" : "down on"}`} ${prevLabel}.`); }
  if (f.delivered.length) { const top = [...f.devs].sort((a, b) => b.points - a.points)[0]; if (top && top.points > 0) headline.push(`Top contributor by points: ${top.name} (${top.points}).`); }
  add({ id: "headline", layout: "kpis", title: "Headline numbers", bullets: headline, kpis: [
    { label: "Points delivered", value: String(stats.points), sub: vs(stats.points, prev?.points, prevLabel), tone: tone(stats.points, prev?.points) },
    { label: "Tickets delivered", value: String(stats.tickets), sub: vs(stats.tickets, prev?.tickets, prevLabel), tone: tone(stats.tickets, prev?.tickets) },
    f.committedPts != null ? { label: "Committed", value: `${done}%`, sub: `${stats.points} of ${f.committedPts} pts`, tone: done! >= 90 ? "good" : done! < 70 ? "bad" : "neutral" }
      : { label: "Hours logged", value: `${r1(stats.loggedHrs)}h`, sub: vs(stats.loggedHrs, prev?.loggedHrs, prevLabel), tone: "neutral" },
    { label: "Avg cycle time", value: stats.cycleDays != null ? `${r1(stats.cycleDays)}d` : "n/a", sub: "In Progress to Done", tone: stats.cycleDays != null && prev?.cycleDays != null ? tone(stats.cycleDays, prev.cycleDays, false) : "neutral" },
    { label: "Bugs fixed", value: String(stats.bugsFixed), sub: `${stats.bugsOpened} opened`, tone: stats.bugsFixed >= stats.bugsOpened ? "good" : "bad" },
  ] });

  add({ id: "timeline", layout: "chart", title: p.kind === "month" ? "Delivery by week" : "Delivery by day", labels: f.buckets.map((b) => b.label),
    series: [{ name: "Points delivered", values: f.buckets.map((b) => b.points) }], unit: "",
    caption: f.buckets.some((b) => b.points) ? `${r1(f.buckets.reduce((a, b) => a + b.hours, 0))}h logged in total.` : "Nothing was marked done in this period." });

  if (p.kind !== "week" && f.velocity.length) add({ id: "velocity", layout: "chart", title: "Velocity trend", labels: f.velocity.map((v) => v.name),
    series: [{ name: "Committed", values: f.velocity.map((v) => v.committed) }, { name: "Completed", values: f.velocity.map((v) => v.completed) }], unit: " pts",
    caption: `Average completed: ${r1(f.velocity.reduce((a, v) => a + v.completed, 0) / f.velocity.length)} points per sprint.` });

  add({ id: "shipped", layout: "table", title: "What shipped", columns: ["Ticket", "Title", "Type", "Pts", "Owner"],
    rows: f.delivered.slice(0, 10).map((d) => [d.key, cap(d.title, 64), label(d.type), String(d.points || "-"), d.assignee ?? "-"]),
    caption: f.delivered.length > 10 ? `Top 10 of ${f.delivered.length} by points.` : f.delivered.length ? undefined : "No tickets were delivered in this period." });

  add({ id: "people", layout: "table", title: "Developer highlights", columns: ["Developer", "Points", "Tickets", "Hours", "Bugs fixed", "Cycle"],
    rows: f.devs.map((d) => [d.name, String(d.points), String(d.tickets), r1(d.hours) + "h", String(d.bugs), d.cycleDays != null ? r1(d.cycleDays) + "d" : "-"]) });

  add({ id: "quality", layout: "kpis", title: "Quality and flow", bullets: [
    stats.stgDeploys ? `${stats.stgFailures} of ${stats.stgDeploys} staging deploys failed (${Math.round((stats.stgFailures / stats.stgDeploys) * 100)}%).` : "No staging deploys in this period.",
    f.estimateAccuracy ? `Estimate accuracy: actual time is ${Math.round(f.estimateAccuracy.avg * 100)}% of estimate across ${f.estimateAccuracy.n} finished card(s).` : "Not enough finished cards with estimates to measure accuracy.",
    `${stats.bugsOpened} bug(s) opened and ${stats.bugsFixed} fixed.`,
  ], kpis: [
    { label: "Staging failures", value: String(stats.stgFailures), sub: vs(stats.stgFailures, prev?.stgFailures, prevLabel), tone: tone(stats.stgFailures, prev?.stgFailures, false) },
    { label: "Bugs opened", value: String(stats.bugsOpened), sub: vs(stats.bugsOpened, prev?.bugsOpened, prevLabel), tone: tone(stats.bugsOpened, prev?.bugsOpened, false) },
    { label: "Bugs fixed", value: String(stats.bugsFixed), sub: vs(stats.bugsFixed, prev?.bugsFixed, prevLabel), tone: tone(stats.bugsFixed, prev?.bugsFixed) },
    { label: "Estimate accuracy", value: f.estimateAccuracy ? `${Math.round(f.estimateAccuracy.avg * 100)}%` : "n/a", sub: "actual ÷ estimate", tone: "neutral" },
  ] });

  add({ id: "carry", layout: "table", title: p.kind === "sprint" ? "Carry-over" : "Still in flight", columns: ["Ticket", "Title", "Status", "Pts", "Owner"],
    rows: f.carry.slice(0, 10).map((c) => [c.key, cap(c.title, 60), label(c.status), String(c.points || "-"), c.assignee ?? "-"]),
    caption: f.carry.length ? (f.carry.length > 10 ? `Showing 10 of ${f.carry.length}.` : undefined) : "Nothing carried over." });

  add({ id: "risks", layout: "bullets", title: "Risks and asks", bullets: risksFor(f) });

  if (f.decisions.length || f.openActions.length) add({ id: "decisions", layout: "bullets", title: "Decisions and open actions",
    bullets: [...f.decisions.slice(0, 6).map((d) => `Decision: ${d}`), ...f.openActions.slice(0, 6).map((a) => `Open action: ${a.text}${a.owner ? ` (${a.owner})` : ""}`)] });

  const ns = f.nextSprint;
  add({ id: "next-sprint", layout: "table", title: ns ? `Plan: ${ns.name}` : "Plan: next sprint", columns: ["Ticket", "Title", "Priority", "Hrs", "Owner"],
    rows: (ns?.rows ?? []).slice(0, 10).map((r) => [r.key, cap(r.title, 60), label(r.priority), r.hours != null ? String(r.hours) : "?", r.assignee ?? "-"]),
    caption: ns ? `${fmt(ns.start, tz)} to ${fmt(ns.end, tz)}${ns.goal ? ` · Goal: ${ns.goal}` : ""} · ${r1(ns.committedHrs)}h committed of ${ns.capacityHrs}h usable (${ns.loadPct}%)${ns.leaveHrs ? ` · ${ns.leaveHrs}h lost to leave and holidays` : ""}${ns.rows.length > 10 ? ` · showing 10 of ${ns.rows.length}` : ""}` : "No next sprint exists yet. Create one in the Sprints planner." });

  const nm = f.nextMonth;
  add({ id: "next-month", layout: "kpis", title: `Outlook: ${nm.label}`, kpis: [
    { label: "Usable capacity", value: `${nm.capacityHrs}h`, sub: nm.leaveHrs ? `4 weeks, after buffer and ${nm.leaveHrs}h of leave` : "team, 4 weeks, after buffer", tone: "neutral" },
    { label: "Planned from backlog", value: `${nm.plannedPts} pts`, sub: `${nm.plannedHrs}h estimated`, tone: "neutral" },
    { label: "Backlog size", value: String(nm.backlogCount), sub: "cards waiting", tone: "neutral" },
    { label: "Carry-in", value: `${nm.carryPts} pts`, sub: "unfinished, in flight", tone: nm.carryPts > 0 ? "bad" : "good" },
  ], bullets: nm.candidates.length ? nm.candidates.slice(0, 6).map((c) => `${c.key} ${cap(c.title, 70)} (${c.hours != null ? c.hours + "h" : "no estimate"})`) : ["The backlog has no estimated cards to plan from yet."] });

  add({ id: "close", layout: "bullets", title: "Discussion", bullets: ["What should we change next sprint?", "Anything blocking you that we can unblock today?", "Agree owners for the open actions."] });
  return slides;
}
