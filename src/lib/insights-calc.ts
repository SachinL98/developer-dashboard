// Pure analysis used by the AI developer profile. No database or network here so it can be unit tested.

export const TOPICS: { id: string; label: string; re: RegExp }[] = [
  { id: "security", label: "Security", re: /\b(security|auth|oauth|sso|permission|rbac|xss|csrf|vulnerab\w*|encrypt\w*|owasp|gdpr|secret|token|2fa|mfa|pen-?test)\b/i },
  { id: "performance", label: "Performance", re: /\b(performance|perf|slow|latency|n\+1|cache|caching|optimi[sz]\w*|speed)\b/i },
  { id: "database", label: "Database", re: /\b(database|db|migration|sql|query|queries|index|schema|postgres|prisma)\b/i },
  { id: "frontend", label: "Frontend / UI", re: /\b(ui|ux|css|frontend|front-end|react|vue|component|layout|responsive|dark mode|accessib\w*|avatar|modal|form)\b/i },
  { id: "api", label: "API / integrations", re: /\b(api|endpoint|webhook|integration|graphql|rest|sdk|third-party)\b/i },
  { id: "billing", label: "Billing / payments", re: /\b(billing|payment|invoice|stripe|refund|dunning|subscription|currency|pricing)\b/i },
  { id: "testing", label: "Testing", re: /\b(test|tests|testing|e2e|coverage|flaky|qa)\b/i },
  { id: "devops", label: "DevOps / infra", re: /\b(deploy\w*|ci|cd|docker|pipeline|infra\w*|build|kubernetes|terraform|monitoring)\b/i },
  { id: "mobile", label: "Mobile", re: /\b(android|ios|mobile|app store|push notification)\b/i },
];

export interface DoneTicket { key: string; title: string; type: string; labels: string[]; points: number | null; estimateHrs: number | null; actualHrs: number; sprintId: string | null; assigneeId: string | null }

export function topicsOf(t: { title: string; labels: string[] }): string[] {
  const text = `${t.title} ${t.labels.join(" ")}`;
  return TOPICS.filter((x) => x.re.test(text)).map((x) => x.id);
}
export const topicLabel = (id: string) => TOPICS.find((t) => t.id === id)?.label ?? id;

export interface TopicStat {
  topic: string; label: string; tickets: number; sprints: number; points: number; actualHrs: number;
  hrsPerPoint: number | null; teamHrsPerPoint: number | null; relativeSpeed: number | null; // >1 = slower than the rest of the team on the same topic
  accuracy: number | null; // actual ÷ estimate (>1 = took longer than estimated)
  signal: "slower" | "faster" | "typical" | "not enough data";
  share: number; // share of this developer's finished tickets
}
export interface ProfileStats {
  eligible: boolean; sprintsCovered: number; ticketsConsidered: number; minSprints: number;
  topics: TopicStat[]; overallAccuracy: number | null; overallHrsPerPoint: number | null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Need finished tickets across at least `minSprints` sprints before drawing any conclusion. */
export function profileStats(devId: string, all: DoneTicket[], minSprints = 2): ProfileStats {
  const mine = all.filter((t) => t.assigneeId === devId && t.actualHrs > 0);
  const others = all.filter((t) => t.assigneeId !== devId && t.actualHrs > 0);
  const sprintsCovered = new Set(mine.map((t) => t.sprintId).filter(Boolean)).size;
  const perPt = (ts: DoneTicket[]) => { const p = sum(ts.map((t) => t.points ?? 0)); return p > 0 ? sum(ts.filter((t) => t.points).map((t) => t.actualHrs)) / p : null; };
  const acc = (ts: DoneTicket[]) => { const e = sum(ts.filter((t) => t.estimateHrs).map((t) => t.estimateHrs!)); return e > 0 ? sum(ts.filter((t) => t.estimateHrs).map((t) => t.actualHrs)) / e : null; };
  const teamAll = perPt(others);

  const topics = TOPICS.map((tp): TopicStat | null => {
    const m = mine.filter((t) => topicsOf(t).includes(tp.id));
    if (!m.length) return null;
    const o = others.filter((t) => topicsOf(t).includes(tp.id));
    const mine_ = perPt(m);
    const teamTopic = o.length >= 2 ? perPt(o) : null;
    const baseline = teamTopic ?? teamAll;
    const rel = mine_ != null && baseline ? mine_ / baseline : null;
    const enough = m.length >= 2 && rel != null;
    return {
      topic: tp.id, label: tp.label, tickets: m.length, sprints: new Set(m.map((t) => t.sprintId).filter(Boolean)).size,
      points: sum(m.map((t) => t.points ?? 0)), actualHrs: r2(sum(m.map((t) => t.actualHrs))),
      hrsPerPoint: mine_ != null ? r2(mine_) : null, teamHrsPerPoint: baseline != null ? r2(baseline) : null, relativeSpeed: rel != null ? r2(rel) : null,
      accuracy: acc(m) != null ? r2(acc(m)!) : null,
      signal: !enough ? "not enough data" : rel! >= 1.3 ? "slower" : rel! <= 0.8 ? "faster" : "typical",
      share: r2(m.length / mine.length),
    };
  }).filter((x): x is TopicStat => !!x).sort((a, b) => b.tickets - a.tickets);

  return {
    eligible: sprintsCovered >= minSprints && mine.length >= 3, sprintsCovered, ticketsConsidered: mine.length, minSprints,
    topics, overallAccuracy: acc(mine) != null ? r2(acc(mine)!) : null, overallHrsPerPoint: perPt(mine) != null ? r2(perPt(mine)!) : null,
  };
}
