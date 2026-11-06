// Quality insights as presentation slides. `all` = a lead or admin (sees every developer); otherwise only `viewerId`'s own row. Pure.
import type { Slide } from "./report";
import type { BugLink, QualityStats } from "./quality-calc";
import type { QualityInsight } from "./quality";

const cap = (s: string, n = 110) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function qualitySlides(stats: QualityStats, links: BugLink[], names: Map<string, string>, insight: QualityInsight | undefined, who: { all: boolean; viewerId: string }): Slide[] {
  const out: Slide[] = [{ id: "title", layout: "title", title: "Quality insights", subtitle: "Where bugs found later come from", meta: [`${stats.bugsTotal} bugs in the last sprints`, `${stats.bugsTraced} traced to earlier work`] }];
  out.push({
    id: "summary", layout: "kpis", title: "The picture",
    kpis: [
      { label: "Bugs logged", value: String(stats.bugsTotal) },
      { label: "Traced", value: `${stats.tracedPct ?? 0}%`, sub: `${stats.bugsTraced} of ${stats.bugsTotal}` },
      { label: "Per 10 delivered", value: stats.teamBugsPer10 == null ? "n/a" : String(stats.teamBugsPer10) },
    ],
    bullets: stats.recurringAreas.length ? [`Recurring: ${stats.recurringAreas.map((a) => `${a.label} (${a.bugs} bugs, ${a.sprints} sprints)`).join("; ")}`] : ["No area is producing repeated bugs. A few bugs here and there is normal."],
  });
  if (stats.bySprint.length > 1) out.push({ id: "trend", layout: "chart", title: "Bugs and delivery by sprint", labels: stats.bySprint.map((s) => s.sprint), series: [{ name: "Bugs logged", values: stats.bySprint.map((s) => s.bugs) }, { name: "Delivered", values: stats.bySprint.map((s) => s.delivered) }], unit: "" });
  if (insight?.patterns.length) out.push({ id: "patterns", layout: "bullets", title: "Patterns", bullets: insight.patterns.map((x) => cap(x, 160)) });
  if (insight?.processSuggestions.length) out.push({ id: "process", layout: "bullets", title: "What would help the whole team", bullets: insight.processSuggestions.map((x) => cap(x, 160)) });
  const people = stats.perDev.filter((p) => who.all || p.developerId === who.viewerId);
  if (people.length) out.push({
    id: "people", layout: "table", title: who.all ? "By developer" : "Your work", columns: ["Developer", "Delivered", "Traced bugs", "Pattern"],
    rows: people.map((p) => [names.get(p.developerId) ?? "Developer", String(p.delivered), String(p.bugsTraced), p.pattern === "recurring" ? "Recurring" : p.pattern === "occasional" ? "Occasional (normal)" : "None"]),
    caption: "One or two traced bugs is normal. A pattern needs repetition across sprints or in one area.",
  });
  const rows = links.filter((l) => l.candidates[0] && (who.all || l.candidates[0].origin.assigneeId === who.viewerId)).slice(0, 8);
  if (rows.length) out.push({ id: "bugs", layout: "table", title: "Bugs and probable origins", columns: ["Bug", "Probable origin", "Match"], rows: rows.map((l) => [`${l.bug.key} ${cap(l.bug.title, 40)}`, `${l.candidates[0].origin.key} ${cap(l.candidates[0].origin.title, 40)}`, l.candidates[0].confidence === "likely" ? "Likely" : "Possible"]) });
  return out;
}
