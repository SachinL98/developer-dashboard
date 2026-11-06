// Bug-to-origin tracing: which delivered ticket most likely introduced a bug that showed up later. Pure, so it can be unit tested.
import { topicsOf, topicLabel } from "./insights-calc";

export interface QTicket {
  key: string; title: string; description: string; type: string; priority: string; labels: string[];
  projectId: string; sprintId: string | null; sprintName: string | null; sprintOrder: number | null; // sprintOrder: 0 = oldest
  assigneeId: string | null; createdAt: Date; doneAt: Date | null;
}
export interface Signal { kind: "mentioned" | "labels" | "wording" | "topic"; detail: string }
export interface Candidate { origin: QTicket; score: number; confidence: "likely" | "possible"; signals: Signal[]; gapDays: number }
export interface BugLink { bug: QTicket; candidates: Candidate[] }

const STOP = new Set(("the a an and or of to in on for with from by at is are was were be been it its this that these those as not no can cannot when then than if else " +
  "bug fix fixes fixed issue issues error errors page update updated add added new ticket should must need needs after before while user users " +
  "what needs doing definition done acceptance criteria behaviour behavior expected actual steps reproduce reproduction resolved resolve resolves scope notes description summary details when where which have has had will would could also into over under only more less same other each verified verify staging docs documentation relevant production deployed").split(/\s+/));

export const tokens = (s: string): string[] =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)).map((w) => w.replace(/(ing|ed|es|s)$/, (m) => (w.length - m.length >= 4 ? "" : m)));

const DAY = 86_400_000;
const GENERIC_LABELS = new Set(["bug", "frontend", "backend", "ui", "api", "web", "mobile", "urgent", "hotfix", "regression"]);

/** Cosine similarity of two token lists, weighting rarer words (idf) more. */
function similarity(a: string[], b: string[], idf: Map<string, number>): { score: number; shared: string[] } {
  const tf = (xs: string[]) => { const m = new Map<string, number>(); xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1)); return m; };
  const ta = tf(a), tb = tf(b);
  let dot = 0, na = 0, nb = 0; const shared: string[] = [];
  for (const [w, c] of ta) { const x = c * (idf.get(w) ?? 1); na += x * x; const d = tb.get(w); if (d) { dot += x * d * (idf.get(w) ?? 1); shared.push(w); } }
  for (const [w, c] of tb) { const x = c * (idf.get(w) ?? 1); nb += x * x; }
  return { score: na && nb ? dot / Math.sqrt(na * nb) : 0, shared };
}

export interface LinkOptions { maxPerBug?: number; minScore?: number; likelyScore?: number; maxGapDays?: number }

/**
 * For every bug, rank earlier, finished, non-bug tickets in the same project that it probably comes from.
 * Signals: the bug names the ticket's key, they share labels, they share distinctive words, or fall in the same topic.
 */
export function linkBugs(tickets: QTicket[], opts: LinkOptions = {}): BugLink[] {
  const { maxPerBug = 3, minScore = 0.35, likelyScore = 0.6, maxGapDays = 180 } = opts;
  const bugs = tickets.filter((t) => t.type === "BUG");
  const pool = tickets.filter((t) => t.type !== "BUG" && t.doneAt && t.assigneeId);
  const bodies = new Map(pool.map((t) => [t.key, tokens(`${t.title} ${t.title} ${t.description}`)]));
  const df = new Map<string, number>();
  for (const toks of bodies.values()) for (const w of new Set(toks)) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = new Map([...df].map(([w, n]) => [w, Math.log(1 + pool.length / n)]));

  return bugs.map((bug) => {
    const bugText = `${bug.title} ${bug.description}`;
    const bugToks = tokens(`${bug.title} ${bug.title} ${bug.description}`);
    const bugTopics = new Set(topicsOf({ title: bugText, labels: bug.labels }));
    const cands: Candidate[] = [];
    for (const o of pool) {
      if (o.projectId !== bug.projectId || o.key === bug.key) continue;
      if (o.doneAt! > bug.createdAt) continue; // the bug must have appeared after the work was finished
      const gapDays = Math.round((bug.createdAt.getTime() - o.doneAt!.getTime()) / DAY);
      if (gapDays > maxGapDays) continue;
      const signals: Signal[] = []; let score = 0;
      if (new RegExp(`\\b${o.key.replace(/[-]/g, "\\-")}\\b`, "i").test(bugText)) { score += 0.6; signals.push({ kind: "mentioned", detail: `the bug mentions ${o.key}` }); }
      const sharedLabels = o.labels.filter((l) => bug.labels.includes(l) && !GENERIC_LABELS.has(l.toLowerCase()));
      if (sharedLabels.length) { score += Math.min(0.3, 0.15 * sharedLabels.length); signals.push({ kind: "labels", detail: `shared label${sharedLabels.length > 1 ? "s" : ""}: ${sharedLabels.join(", ")}` }); }
      const sim = similarity(bugToks, bodies.get(o.key)!, idf);
      if (sim.score >= 0.12 && sim.shared.length >= 2) { score += Math.min(0.5, sim.score * 1.2); signals.push({ kind: "wording", detail: `similar wording: ${sim.shared.slice(0, 5).join(", ")}` }); }
      const oTopics = topicsOf({ title: `${o.title} ${o.description}`, labels: o.labels }).filter((t) => bugTopics.has(t));
      if (oTopics.length && signals.length) { score += 0.1; signals.push({ kind: "topic", detail: `same area: ${topicLabel(oTopics[0])}` }); }
      if (!signals.length) continue;
      score *= 1 - Math.min(0.3, gapDays / (maxGapDays * 2)); // older work is a little less likely to be the source
      if (score >= minScore) cands.push({ origin: o, score: Math.round(score * 100) / 100, confidence: score >= likelyScore ? "likely" : "possible", signals, gapDays });
    }
    cands.sort((a, b) => b.score - a.score);
    return { bug, candidates: cands.slice(0, maxPerBug) };
  });
}

export interface DevQuality {
  developerId: string; delivered: number; bugsTraced: number; likelyBugs: number; bugsPer10: number | null; vsTeam: "higher" | "similar" | "lower" | "not enough data";
  highPriority: number; areas: { topic: string; label: string; bugs: number }[];
}
export interface QualityStats { bugsTotal: number; bugsTraced: number; tracedPct: number | null; teamBugsPer10: number | null; perDev: DevQuality[]; bySprint: { sprint: string; bugs: number; delivered: number }[] }

/** Roll the links up per developer. Only the best candidate of each bug counts, and only when it is likely or clearly the top match. */
export function qualityStats(tickets: QTicket[], links: BugLink[]): QualityStats {
  const done = tickets.filter((t) => t.type !== "BUG" && t.doneAt && t.assigneeId);
  const best = links.map((l) => ({ bug: l.bug, top: l.candidates[0] })).filter((x) => x.top);
  const delivered = new Map<string, number>(); done.forEach((t) => delivered.set(t.assigneeId!, (delivered.get(t.assigneeId!) ?? 0) + 1));
  const teamDelivered = done.length;
  const teamBugsPer10 = teamDelivered ? Math.round((best.length / teamDelivered) * 100) / 10 : null;
  const perDev: DevQuality[] = [...delivered.keys()].map((id) => {
    const mine = best.filter((x) => x.top.origin.assigneeId === id);
    const n = delivered.get(id)!;
    const per10 = n >= 3 ? Math.round((mine.length / n) * 100) / 10 : null;
    const areas = new Map<string, number>();
    for (const x of mine) for (const tp of topicsOf({ title: `${x.top.origin.title} ${x.bug.title}`, labels: x.top.origin.labels }).slice(0, 1)) areas.set(tp, (areas.get(tp) ?? 0) + 1);
    return {
      developerId: id, delivered: n, bugsTraced: mine.length, likelyBugs: mine.filter((x) => x.top.confidence === "likely").length, bugsPer10: per10,
      vsTeam: ((): DevQuality["vsTeam"] => per10 == null || teamBugsPer10 == null || best.length < 3 ? "not enough data" : per10 >= teamBugsPer10 * 1.5 && mine.length >= 2 ? "higher" : per10 <= teamBugsPer10 * 0.5 ? "lower" : "similar")(),
      highPriority: mine.filter((x) => ["HIGH", "CRITICAL"].includes(x.bug.priority)).length,
      areas: [...areas].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([topic, bugs]) => ({ topic, label: topicLabel(topic), bugs })),
    };
  }).sort((a, b) => b.bugsTraced - a.bugsTraced);
  const sprints = [...new Set(tickets.map((t) => t.sprintName).filter(Boolean))] as string[];
  const bySprint = sprints.map((s) => ({ sprint: s, bugs: tickets.filter((t) => t.type === "BUG" && t.sprintName === s).length, delivered: done.filter((t) => t.sprintName === s).length }));
  const bugsTotal = links.length;
  return { bugsTotal, bugsTraced: best.length, tracedPct: bugsTotal ? Math.round((best.length / bugsTotal) * 100) : null, teamBugsPer10, perDev, bySprint };
}
