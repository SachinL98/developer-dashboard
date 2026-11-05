// Meeting engagement metrics from talk time. Pure (no database): per meeting, per sprint and per month.
import { engagementOf, type Engagement } from "./transcript";

export interface SpeakerRow { developerId: string | null; name: string; talkSec: number; words: number; turns: number; estimated: boolean }
export interface MeetingStat { id: string; title: string; kind: string; startsAt: Date; durationSec: number | null; speakers: SpeakerRow[]; expected: string[] }

export interface PersonAgg { key: string; name: string; developerId: string | null; meetingsSpoke: number; participationPct: number; talkSec: number; avgSharePct: number; words: number; turns: number; estimated: boolean }
export interface PeriodAgg {
  label: string; meetings: number; totalTalkSec: number; avgSpeakers: number; avgBalance: number | null; avgDominantPct: number | null;
  silentAttendees: number; // expected attendees who said nothing, summed over the period
  people: PersonAgg[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (n: number) => Math.round(n * 10) / 10;

export const meetingEngagement = (m: MeetingStat): Engagement => engagementOf(m.speakers.map(({ name, talkSec, words, turns, estimated }) => ({ name, talkSec, words, turns, estimated })), m.expected);

/** Roll a set of meetings up into one period (a sprint or a month). Only meetings that have speaker data count. */
export function aggregate(label: string, meetings: MeetingStat[]): PeriodAgg {
  const withData = meetings.filter((m) => m.speakers.length > 0);
  const eng = withData.map(meetingEngagement);
  const by = new Map<string, { name: string; developerId: string | null; spoke: number; talk: number; shares: number[]; words: number; turns: number; est: boolean }>();
  withData.forEach((m, i) => {
    for (const row of eng[i].rows) {
      const sp = m.speakers.find((x) => x.name === row.name)!;
      const key = sp.developerId ?? `name:${row.name.toLowerCase()}`;
      const p = by.get(key) ?? { name: row.name, developerId: sp.developerId, spoke: 0, talk: 0, shares: [], words: 0, turns: 0, est: false };
      p.spoke++; p.talk += row.talkSec; p.shares.push(row.sharePct); p.words += row.words; p.turns += row.turns; p.est = p.est || row.estimated;
      if (sp.developerId) p.name = row.name;
      by.set(key, p);
    }
  });
  const n = withData.length;
  const people = [...by.entries()].map(([key, p]): PersonAgg => ({
    key, name: p.name, developerId: p.developerId, meetingsSpoke: p.spoke, participationPct: n ? Math.round((p.spoke / n) * 100) : 0,
    talkSec: p.talk, avgSharePct: r1(avg(p.shares) ?? 0), words: p.words, turns: p.turns, estimated: p.est,
  })).sort((a, b) => b.talkSec - a.talkSec);
  return {
    label, meetings: n, totalTalkSec: eng.reduce((a, e) => a + e.totalTalkSec, 0), avgSpeakers: r1(avg(eng.map((e) => e.speakers)) ?? 0),
    avgBalance: n ? Math.round((avg(eng.map((e) => e.balance)) ?? 0) * 100) / 100 : null, avgDominantPct: n ? Math.round(avg(eng.map((e) => e.dominantShare)) ?? 0) : null,
    silentAttendees: eng.reduce((a, e) => a + e.silent.length, 0), people,
  };
}

/** Everyone's numbers for leads and admins; everyone else sees the team totals and their own row only. */
export function forViewer<T extends PeriodAgg>(p: T, viewerId: string, canSeeAll: boolean): T {
  return canSeeAll ? p : { ...p, people: p.people.filter((x) => x.developerId === viewerId) };
}

export const toneForBalance = (b: number | null) => (b == null ? "n/a" : b >= 0.8 ? "Balanced" : b >= 0.55 ? "Somewhat uneven" : "One or two people dominate");

/** "2026-11" in the given timezone, for grouping by month. */
export const monthKey = (d: Date, tz = "UTC") => d.toLocaleDateString("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).slice(0, 7);
