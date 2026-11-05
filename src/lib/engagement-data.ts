import { db } from "./db";
import { getWorkspace } from "./config";
import { aggregate, monthKey, type MeetingStat, type PeriodAgg } from "./engagement";

const DAY = 86_400_000;

export async function loadMeetingStats(since: Date, until = new Date(Date.now() + DAY)): Promise<MeetingStat[]> {
  const rows = await db.meeting.findMany({ where: { startsAt: { gte: since, lt: until }, speakers: { some: {} } }, orderBy: { startsAt: "desc" }, include: { speakers: true } });
  return rows.map((m) => ({
    id: m.id, title: m.title, kind: m.kind, startsAt: m.startsAt, durationSec: m.durationSec,
    speakers: m.speakers.map((s) => ({ developerId: s.developerId, name: s.name, talkSec: s.talkSec, words: s.words, turns: s.turns, estimated: s.estimated })),
    expected: m.attendees.filter((a) => !a.includes("@")),
  }));
}

export interface EngagementData { meetings: MeetingStat[]; bySprint: PeriodAgg[]; byMonth: PeriodAgg[]; analysed: number; total: number }

/** Engagement for the last sprints and months, plus the per-meeting list. Everything is people-level: filter with forViewer before showing it. */
export async function loadEngagement(now = new Date()): Promise<EngagementData> {
  const tz = (await getWorkspace()).timezone;
  const since = new Date(now.getTime() - 200 * DAY);
  const [meetings, sprints, total] = await Promise.all([
    loadMeetingStats(since), db.sprint.findMany({ orderBy: { startDate: "desc" }, take: 6 }), db.meeting.count({ where: { startsAt: { gte: since, lt: now } } }),
  ]);
  const bySprint = sprints.reverse().map((s) => aggregate(s.name, meetings.filter((m) => m.startsAt >= s.startDate && m.startsAt < new Date(s.endDate.getTime() + DAY))));
  const months = [...new Set(meetings.map((m) => monthKey(m.startsAt, tz)))].sort().slice(-6);
  const byMonth = months.map((k) => aggregate(new Date(`${k}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }), meetings.filter((m) => monthKey(m.startsAt, tz) === k)));
  return { meetings, bySprint, byMonth, analysed: meetings.length, total };
}
