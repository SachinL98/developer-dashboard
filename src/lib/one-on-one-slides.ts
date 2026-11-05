// Turns a monthly 1:1 report into presentation slides, so it can be presented, printed and shared like the other reports. Pure.
import type { OneOnOneReport } from "./one-on-one";
import type { Slide } from "./report";

const monthName = (k: string) => new Date(`${k}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const val = (v: number | null, unit: string) => (v == null ? "n/a" : `${v}${unit === "%" || unit === "×" ? unit : unit ? " " + unit : ""}`);
const cap = (s: string, n = 150) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function oneOnOneSlides(r: OneOnOneReport, name: string): Slide[] {
  const out: Slide[] = [{
    id: "title", layout: "title", title: `1:1 report: ${name}`, subtitle: monthName(r.monthKey),
    meta: [`Covers ${r.curLabel}`, `Compared with ${r.baseLabel}`],
  }];
  if (r.ai?.headline) out.push({ id: "summary", layout: "bullets", title: "How it went", bullets: [r.ai.headline] });
  out.push({
    id: "scorecard", layout: "table", title: "Scorecard", columns: ["Measure", "Last 2 weeks", "Before (per 2 weeks)", "Change"],
    rows: r.rows.map((x) => [x.label, val(x.cur, x.unit), val(x.base, x.unit), x.deltaPct == null ? (x.trend === "n/a" ? "n/a" : "new") : `${x.deltaPct > 0 ? "+" : ""}${x.deltaPct}%`]),
    caption: "Counts are per two weeks so the periods compare fairly. Hours, leave and talk time are context, not good or bad.",
  });
  const wins = r.ai ? r.ai.wentWell.map((x) => `${x.point}: ${cap(x.evidence)}`) : r.findings.improved;
  const grow = r.ai ? r.ai.needsAttention.map((x) => `${x.point}: ${cap(x.evidence)}`) : r.findings.attention;
  out.push({ id: "wins", layout: "bullets", title: "Wins and improvements", bullets: wins.length ? wins : ["Steady work. Nothing jumped out this time."] });
  out.push({ id: "grow", layout: "bullets", title: "Room to grow", bullets: grow.length ? grow : ["Nothing to worry about here. Keep going."] });
  if (r.ai?.vsLastMonth) out.push({ id: "vs-last", layout: "bullets", title: "Compared with last month", bullets: [r.ai.vsLastMonth, ...r.ai.previousSuggestions.map((p) => `${p.suggestion}: ${p.status.replace("_", " ")}${p.note ? ` (${cap(p.note, 80)})` : ""}`)] });
  if (r.ai?.suggestions.length) out.push({ id: "suggestions", layout: "bullets", title: "Suggestions to help you grow", bullets: r.ai.suggestions.map((x) => `${x.title}: ${cap(x.how)}`) });
  if (r.ai?.talkingPoints.length) out.push({ id: "talking", layout: "bullets", title: "Talking points for the 1:1", bullets: r.ai.talkingPoints });
  if (r.ai?.questionsForLead.length) out.push({ id: "questions", layout: "bullets", title: "Questions for your lead", bullets: r.ai.questionsForLead });
  if (r.ai?.estimateCheck.length) {
    out.push({
      id: "points", layout: "table", title: "Story points check", columns: ["Ticket", "Given", "Looks right", "Why"],
      rows: r.ai.estimateCheck.slice(0, 6).map((x) => [x.key, String(x.assignedPoints ?? r.pointsGaps.find((g) => g.key === x.key)?.points ?? "?"), String(x.suggestedPoints), cap(x.reason, 90)]),
      caption: "Often the card was pointed low for its scope: an estimation gap, not a speed problem.",
    });
  }
  if (r.done.length) out.push({ id: "done", layout: "table", title: "What was finished", columns: ["Ticket", "Title", "Type", "Points"], rows: r.done.slice(0, 10).map((t) => [t.key, cap(t.title, 70), t.type.toLowerCase(), t.points ? String(t.points) : ""]) });
  if (r.ai?.focusNextMonth.length) out.push({ id: "focus", layout: "bullets", title: "Focus for next month", bullets: r.ai.focusNextMonth });
  return out;
}
