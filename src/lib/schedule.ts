import { zonedParts, zonedToUtc } from "./time";

export type MeetingKindKey = "STANDUP" | "GROOMING" | "ESTIMATION" | "SPRINT_PLAN" | "WEEKLY_SUMMARY" | "DEMO";

export interface MeetingDef {
  kind: MeetingKindKey; title: string; days: number[]; // 0=Sun..6=Sat
  start: [number, number]; end: [number, number]; blurb: string; color: string;
}

const WEEKDAYS = [1, 2, 3, 4, 5];
export const MEETING_DEFS: MeetingDef[] = [
  { kind: "STANDUP", title: "Daily Standup", days: WEEKDAYS, start: [8, 45], end: [9, 0], color: "#6ee7ff", blurb: "Yesterday / today / blockers" },
  { kind: "GROOMING", title: "Jira Cards Grooming", days: WEEKDAYS, start: [9, 0], end: [9, 15], color: "#a78bfa", blurb: "Discuss and groom complicated cards" },
  { kind: "ESTIMATION", title: "Time Estimation", days: [1], start: [9, 15], end: [9, 45], color: "#fbbf24", blurb: "Rough time estimation for sprint cards" },
  { kind: "SPRINT_PLAN", title: "Sprint Plan", days: [1], start: [11, 30], end: [12, 30], color: "#f472b6", blurb: "Priority order and next sprint scope" },
  { kind: "WEEKLY_SUMMARY", title: "Weekly Summary", days: [3], start: [17, 0], end: [17, 30], color: "#34d399", blurb: "What shipped, what slipped" },
  { kind: "DEMO", title: "Demo", days: [4], start: [11, 30], end: [12, 0], color: "#a3e635", blurb: "Demo finished work" },
];

export const defFor = (k: string) => MEETING_DEFS.find((d) => d.kind === k);

export interface Occurrence { kind: MeetingKindKey; title: string; startsAt: Date; endsAt: Date }

/** All scheduled meetings between `from` (inclusive) and `days` days ahead, in team time. */
export function occurrences(from: Date, days: number, defs: MeetingDef[] = MEETING_DEFS): Occurrence[] {
  const out: Occurrence[] = [];
  for (let i = 0; i < days; i++) {
    const p = zonedParts(new Date(from.getTime() + i * 86_400_000));
    // anchor each day in zoned calendar to avoid DST drift
    for (const def of defs) {
      if (!def.days.includes(p.wd)) continue;
      out.push({
        kind: def.kind, title: def.title,
        startsAt: zonedToUtc(p.y, p.m, p.d, def.start[0], def.start[1]),
        endsAt: zonedToUtc(p.y, p.m, p.d, def.end[0], def.end[1]),
      });
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
