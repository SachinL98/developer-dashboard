// Fault patterns from Claude PR reviews: which kinds of problems recur for a developer or the team, and whether that is improving.
// Pure (no DB) so it can be unit tested. Only full Claude reviews are analysed; heuristic scans and manual checklists carry too little signal.
import type { Slide } from "./report";

export const CATEGORIES = [
  { id: "migrations", label: "Migrations and seeders", tip: "Run the migration against a copy of production-sized data, write the down step, and check locks before opening the PR." },
  { id: "security", label: "Security and secrets", tip: "Before pushing, scan the diff for credentials and check that every new endpoint calls the shared auth guard." },
  { id: "data-safety", label: "Data safety", tip: "Wrap destructive queries in a guard or soft delete, and test the rollback path." },
  { id: "scope", label: "Scope and acceptance criteria", tip: "Re-read the ticket's acceptance criteria against the diff, and move unrelated changes to their own ticket." },
  { id: "tests", label: "Tests", tip: "Add the failing test first for a bug fix, and one test per new behaviour in the ticket." },
  { id: "performance", label: "Performance and queries", tip: "Check new loops and queries on realistic data sizes; batch lookups and add the index you rely on." },
  { id: "error-handling", label: "Error handling", tip: "Decide for each new failure what the user sees and what gets logged; avoid empty catch blocks." },
  { id: "validation", label: "Input validation", tip: "Validate at the boundary with a schema, including limits on length and size." },
  { id: "logging", label: "Logging and leftovers", tip: "Remove debug output and TODOs before review, and add one useful log line per new flow." },
  { id: "api-compat", label: "API contracts and config", tip: "List new env vars and contract changes in the PR description, with safe defaults." },
  { id: "docs", label: "Docs and changelog", tip: "Update the docs or changelog in the same PR whenever behaviour changes." },
  { id: "naming-style", label: "Naming and code style", tip: "Run the formatter and linter locally, and match the naming used in neighbouring files." },
  { id: "project-rules", label: "Project-specific rules", tip: "Skim the project's review points before starting, and tick them off before requesting review." },
  { id: "other", label: "Other", tip: "Look at the individual findings for the common thread." },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? "Other";
const tipFor = (id: string) => CATEGORIES.find((c) => c.id === id)?.tip ?? "";
const isCategory = (s: unknown): s is CategoryId => CATEGORIES.some((c) => c.id === s);

/** Checklist item id to category. */
const ITEM_CATEGORY: Record<string, CategoryId> = {
  migrations: "migrations", seeders: "migrations", secrets: "security", authz: "security", "data-loss": "data-safety", scope: "scope", tests: "tests", "n+1": "performance",
  errors: "error-handling", validation: "validation", logging: "logging", "api-compat": "api-compat", config: "api-compat", docs: "docs",
};

const KEYWORDS: [RegExp, CategoryId][] = [
  [/migrat|seed|schema change|alter table|rollback/i, "migrations"],
  [/secret|credential|token|password|api key|auth|permission|injection|xss|csrf|sanitis|sanitiz/i, "security"],
  [/delete|drop |truncate|data loss|destructive/i, "data-safety"],
  [/scope|acceptance|requirement|unrelated|out of scope/i, "scope"],
  [/\btests?\b|coverage|assert|spec\b/i, "tests"],
  [/n\+1|performance|slow|index|unbounded|loop|memory|cache/i, "performance"],
  [/error|exception|catch|swallow|fail(?:ure)? handling|retry|timeout/i, "error-handling"],
  [/validat|bounds|limit|malformed/i, "validation"],
  [/log|console\.|debug|todo|leftover/i, "logging"],
  [/api|contract|breaking|backwards|env var|config/i, "api-compat"],
  [/docs?\b|documentation|readme|changelog/i, "docs"],
  [/nam(?:e|ing)|style|format|lint|typo|comment|dead code|unused/i, "naming-style"],
];

export interface Finding { severity: "critical" | "important" | "minor"; title: string; detail?: string; file?: string; line?: number; category?: string }
export interface ItemLite { id: string; label: string; severity: "critical" | "important"; checked: boolean; note?: string; project?: boolean }

/** Category of a finding: the one Claude chose, else a keyword guess from its text. */
export function categorize(f: Pick<Finding, "title" | "detail" | "category">): CategoryId {
  if (isCategory(f.category)) return f.category;
  const text = `${f.title} ${f.detail ?? ""}`;
  return KEYWORDS.find(([re]) => re.test(text))?.[1] ?? "other";
}

export interface ReviewRow {
  reviewId: string; ticketId: string; ticketKey: string; ticketTitle: string; project: string; developerId: string | null; developer: string | null;
  round: number; at: Date; passed: boolean; items: ItemLite[]; findings: Finding[];
}

const WEIGHT = { critical: 3, important: 2, minor: 1 } as const;
type Sev = keyof typeof WEIGHT;
const worse = (a: Sev, b: Sev): Sev => (WEIGHT[a] >= WEIGHT[b] ? a : b);
const NOT_A_FAULT = /^(not assessed|claude could not tell)/i;

interface Fault { category: CategoryId; severity: Sev; title: string; detail?: string; file?: string }

/** Everything wrong in one review: failed checklist items and findings, one entry per category with the worst severity. */
export function faultsOf(r: Pick<ReviewRow, "items" | "findings">): Fault[] {
  const out: Fault[] = [];
  for (const i of r.items ?? []) {
    if (i.checked || NOT_A_FAULT.test(i.note ?? "")) continue;
    out.push({ category: i.project ? "project-rules" : ITEM_CATEGORY[i.id] ?? "other", severity: i.severity, title: i.label, detail: i.note });
  }
  for (const f of r.findings ?? []) out.push({ category: categorize(f), severity: f.severity, title: f.title, detail: f.detail, file: f.file });
  const by = new Map<CategoryId, Fault>();
  for (const f of out) {
    const cur = by.get(f.category);
    // keep the most severe, preferring a concrete finding (it names a file) over a checklist label
    if (!cur || WEIGHT[f.severity] > WEIGHT[cur.severity] || (WEIGHT[f.severity] === WEIGHT[cur.severity] && f.file && !cur.file)) by.set(f.category, f);
  }
  return [...by.values()];
}
const score = (faults: Fault[]) => faults.reduce((a, f) => a + WEIGHT[f.severity], 0);

export interface Example { ticketKey: string; title: string; detail?: string; file?: string; severity: Sev }
export interface CatStat {
  id: CategoryId; label: string; tickets: number; share: number; occurrences: number; worst: Sev; recurring: boolean;
  trend: "less" | "more" | "steady" | "new" | "unknown"; examples: Example[]; tip: string;
}
export interface PatternSummary {
  reviews: number; tickets: number; enough: boolean; firstTryPassRate: number | null; avgRounds: number | null; avgFirstPassScore: number | null;
  trend: "improving" | "worsening" | "steady" | "unknown"; trendDetail: { earlier: number; recent: number } | null;
  categories: CatStat[]; focus: CatStat[]; strengths: string[]; byMonth: { label: string; score: number; tickets: number }[];
}
export interface DevPattern extends PatternSummary { developerId: string; name: string }
export interface Analysis { team: PatternSummary; devs: DevPattern[]; byProject: { project: string; tickets: number; firstTryPassRate: number | null; top: CatStat[] }[] }

export const MIN_TICKETS = 3;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);

interface TicketRun { ticketId: string; key: string; title: string; firstAt: Date; rounds: number; firstPassed: boolean; firstScore: number; cats: Map<CategoryId, { sev: Sev; example: Example; count: number }> }

function runsOf(rows: ReviewRow[]): TicketRun[] {
  const by = new Map<string, ReviewRow[]>();
  for (const r of rows) (by.get(r.ticketId) ?? by.set(r.ticketId, []).get(r.ticketId)!).push(r);
  return [...by.values()].map((rs) => {
    rs.sort((a, b) => a.round - b.round || a.at.getTime() - b.at.getTime());
    const first = rs[0];
    const cats: TicketRun["cats"] = new Map();
    for (const r of rs) for (const f of faultsOf(r)) {
      const ex: Example = { ticketKey: r.ticketKey, title: f.title, detail: f.detail?.slice(0, 220), file: f.file, severity: f.severity };
      const cur = cats.get(f.category);
      cats.set(f.category, cur ? { sev: worse(cur.sev, f.severity), example: WEIGHT[f.severity] > WEIGHT[cur.example.severity] ? ex : cur.example, count: cur.count + 1 } : { sev: f.severity, example: ex, count: 1 });
    }
    return { ticketId: first.ticketId, key: first.ticketKey, title: first.ticketTitle, firstAt: first.at, rounds: rs.length, firstPassed: first.passed, firstScore: score(faultsOf(first)), cats };
  }).sort((a, b) => a.firstAt.getTime() - b.firstAt.getTime());
}

export function summarise(rows: ReviewRow[]): PatternSummary {
  const runs = runsOf(rows);
  const n = runs.length;
  const enough = n >= MIN_TICKETS;
  const ids = new Set<CategoryId>(runs.flatMap((r) => [...r.cats.keys()]));
  const half = Math.floor(n / 2);
  const earlier = runs.slice(0, half), recent = runs.slice(n - half);
  const canTrend = n >= 4;
  const categories: CatStat[] = [...ids].map((id) => {
    const withCat = runs.filter((r) => r.cats.has(id));
    const examples = withCat.map((r) => r.cats.get(id)!.example).sort((a, b) => WEIGHT[b.severity] - WEIGHT[a.severity]).slice(0, 3);
    const rate = (xs: TicketRun[]) => (xs.length ? xs.filter((r) => r.cats.has(id)).length / xs.length : 0);
    let trend: CatStat["trend"] = "unknown";
    if (canTrend) {
      const d = rate(recent) - rate(earlier);
      trend = rate(earlier) === 0 && rate(recent) > 0 ? "new" : d <= -0.15 ? "less" : d >= 0.15 ? "more" : "steady";
    }
    return {
      id, label: categoryLabel(id), tickets: withCat.length, share: n ? withCat.length / n : 0, occurrences: withCat.reduce((a, r) => a + r.cats.get(id)!.count, 0),
      worst: withCat.reduce<Sev>((w, r) => worse(w, r.cats.get(id)!.sev), "minor"), recurring: enough && withCat.length >= 2 && withCat.length / n >= 0.25, trend, examples, tip: tipFor(id),
    };
  }).sort((a, b) => b.tickets - a.tickets || WEIGHT[b.worst] - WEIGHT[a.worst]);

  const e = avg(earlier.map((r) => r.firstScore)), c = avg(recent.map((r) => r.firstScore));
  let trend: PatternSummary["trend"] = "unknown";
  if (canTrend && e != null && c != null) trend = e === 0 && c === 0 ? "steady" : c < e * 0.8 ? "improving" : c > e * 1.2 || (e === 0 && c > 0) ? "worsening" : "steady";

  const strengths: string[] = [];
  const fpr = n ? runs.filter((r) => r.firstPassed).length / n : null;
  if (enough && fpr != null && fpr >= 0.7) strengths.push(`${Math.round(fpr * 100)}% of pull requests pass Claude's review on the first try.`);
  if (enough && avg(runs.map((r) => r.rounds))! <= 1.3) strengths.push("Pull requests rarely need more than one review round.");
  for (const cat of categories.filter((x) => x.trend === "less")) strengths.push(`${cat.label} issues are showing up less often than before.`);
  if (trend === "improving") strengths.push("Faults on the first review of a pull request are trending down.");
  if (enough && !categories.length) strengths.push("No faults were found in any review so far.");

  const byMonthMap = new Map<string, TicketRun[]>();
  for (const r of runs) { const k = r.firstAt.toISOString().slice(0, 7); (byMonthMap.get(k) ?? byMonthMap.set(k, []).get(k)!).push(r); }
  const byMonth = [...byMonthMap.entries()].sort().map(([k, xs]) => ({ label: new Date(k + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }), score: Math.round(avg(xs.map((r) => r.firstScore))! * 10) / 10, tickets: xs.length }));

  return {
    reviews: rows.length, tickets: n, enough, firstTryPassRate: fpr, avgRounds: r2(avg(runs.map((r) => r.rounds))), avgFirstPassScore: r2(avg(runs.map((r) => r.firstScore))),
    trend, trendDetail: canTrend && e != null && c != null ? { earlier: Math.round(e * 10) / 10, recent: Math.round(c * 10) / 10 } : null,
    categories, focus: categories.filter((x) => x.recurring).slice(0, 3), strengths, byMonth,
  };
}

export function analyse(rows: ReviewRow[]): Analysis {
  const devIds = [...new Set(rows.map((r) => r.developerId).filter((x): x is string => !!x))];
  const devs = devIds.map((id) => {
    const mine = rows.filter((r) => r.developerId === id);
    return { developerId: id, name: mine[0].developer ?? "Unknown", ...summarise(mine) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const projects = [...new Set(rows.map((r) => r.project))].sort();
  return { team: summarise(rows), devs, byProject: projects.map((p) => { const s = summarise(rows.filter((r) => r.project === p)); return { project: p, tickets: s.tickets, firstTryPassRate: s.firstTryPassRate, top: s.categories.slice(0, 3) }; }) };
}

const pct = (n: number | null) => (n == null ? "n/a" : `${Math.round(n * 100)}%`);
const TREND_TEXT = { improving: "Improving", worsening: "Needs attention", steady: "Steady", unknown: "Too early to say" } as const;
const CAT_TREND = { less: "less often", more: "more often", steady: "steady", new: "new lately", unknown: "-" } as const;

/** A constructive slide deck for one developer, or the whole team, built from the analysis. */
export function patternSlides(title: string, subject: "developer" | "team", s: PatternSummary, extra?: { devs?: DevPattern[]; byProject?: Analysis["byProject"] }, now = new Date()): Slide[] {
  const slides: Slide[] = [];
  const who = subject === "team" ? "the team" : "you";
  slides.push({ id: "title", layout: "title", title, subtitle: "Code review patterns", meta: [`Based on ${s.reviews} Claude review(s) across ${s.tickets} pull request(s)`, `Prepared ${now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`, "A tool for growth, not a score. Only the developer and leads see this."] });
  slides.push({ id: "summary", layout: "kpis", title: "Where things stand", kpis: [
    { label: "Passed first try", value: pct(s.firstTryPassRate), sub: `${s.tickets} pull request(s)`, tone: s.firstTryPassRate != null && s.firstTryPassRate >= 0.7 ? "good" : "neutral" },
    { label: "Avg review rounds", value: s.avgRounds != null ? String(s.avgRounds) : "n/a", sub: "per pull request", tone: "neutral" },
    { label: "Faults on first review", value: s.avgFirstPassScore != null ? String(s.avgFirstPassScore) : "n/a", sub: "weighted by severity", tone: "neutral" },
    { label: "Trend", value: TREND_TEXT[s.trend], sub: s.trendDetail ? `${s.trendDetail.earlier} earlier, ${s.trendDetail.recent} recent` : "needs 4+ reviewed PRs", tone: s.trend === "improving" ? "good" : s.trend === "worsening" ? "bad" : "neutral" },
  ], bullets: s.enough ? s.strengths.slice(0, 3).length ? s.strengths.slice(0, 3) : ["Keep an eye on the focus areas on the next slides."] : [`Only ${s.tickets} reviewed pull request(s) so far. Patterns appear once there are ${MIN_TICKETS} or more, so treat these numbers as a first look.`] });
  slides.push({ id: "focus", layout: "bullets", title: "Focus areas", bullets: s.focus.length ? s.focus.map((f) => `${f.label}: seen in ${f.tickets} of ${s.tickets} pull requests. ${f.tip}`) : [s.enough ? `No recurring pattern stands out for ${who}. Individual findings are still worth a look.` : "Not enough reviews yet to call anything a pattern."] });
  slides.push({ id: "patterns", layout: "table", title: "All fault categories", columns: ["Category", "PRs", "Share", "Worst", "Trend"],
    rows: s.categories.slice(0, 10).map((c) => [c.label, String(c.tickets), `${Math.round(c.share * 100)}%`, c.worst, CAT_TREND[c.trend]]),
    caption: s.categories.length ? undefined : "No faults found in the reviews so far." });
  const ex = s.focus.length ? s.focus : s.categories.slice(0, 3);
  if (ex.length) slides.push({ id: "examples", layout: "bullets", title: "Examples", bullets: ex.flatMap((c) => c.examples.slice(0, 2).map((e) => `${c.label} · ${e.ticketKey}: ${e.title}${e.file ? ` (${e.file})` : ""}`)).slice(0, 6) });
  if (subject === "team" && extra?.devs?.length) slides.push({ id: "people", layout: "table", title: "By developer", columns: ["Developer", "PRs", "Passed first try", "Trend", "Main focus"],
    rows: extra.devs.map((d) => [d.name, String(d.tickets), pct(d.firstTryPassRate), TREND_TEXT[d.trend], d.focus[0]?.label ?? "-"]) });
  if (subject === "team" && extra?.byProject?.length) slides.push({ id: "projects", layout: "table", title: "By project", columns: ["Project", "PRs", "Passed first try", "Most common"],
    rows: extra.byProject.map((p) => [p.project, String(p.tickets), pct(p.firstTryPassRate), p.top[0]?.label ?? "-"]) });
  slides.push({ id: "next", layout: "bullets", title: "Suggested next steps", bullets: [
    ...(s.focus.slice(0, 2).map((f) => f.tip)), ...(s.focus.length ? [] : ["Keep requesting review early; small pull requests make patterns easier to spot."]),
    "Before requesting review, run through the checklist for the focus areas above.", "Revisit this report after the next sprint to see how it moves.",
  ].slice(0, 4) });
  return slides;
}
