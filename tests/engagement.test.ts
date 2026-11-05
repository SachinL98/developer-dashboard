import { describe, expect, it } from "vitest";
import { aggregate, forViewer, meetingEngagement, monthKey, toneForBalance, type MeetingStat } from "../src/lib/engagement";

const sp = (name: string, talkSec: number, developerId: string | null = name.toLowerCase()) => ({ developerId, name, talkSec, words: talkSec * 2, turns: 3, estimated: false });
const m = (id: string, speakers: ReturnType<typeof sp>[], expected: string[] = []): MeetingStat => ({ id, title: id, kind: "STANDUP", startsAt: new Date("2026-10-12T04:00:00Z"), durationSec: 900, speakers, expected });

describe("meetingEngagement", () => {
  it("computes shares and who stayed silent", () => {
    const e = meetingEngagement(m("a", [sp("Amaya", 300), sp("Nuwan", 100)], ["Amaya", "Nuwan", "Dilini"]));
    expect(e.rows[0]).toMatchObject({ name: "Amaya", sharePct: 75 });
    expect(e.silent).toEqual(["Dilini"]);
  });
});

describe("aggregate", () => {
  const meetings = [
    m("1", [sp("Amaya", 300), sp("Nuwan", 100)], ["Amaya", "Nuwan", "Dilini"]),
    m("2", [sp("Amaya", 100), sp("Nuwan", 100), sp("Dilini", 100)], ["Amaya", "Nuwan", "Dilini"]),
    m("3", []), // no speaker data: ignored
  ];
  const a = aggregate("Sprint 24", meetings);
  it("only counts meetings that have speaker data", () => { expect(a.meetings).toBe(2); });
  it("totals talk time and participation per person", () => {
    const nuwan = a.people.find((p) => p.name === "Nuwan")!;
    expect(nuwan).toMatchObject({ talkSec: 200, meetingsSpoke: 2, participationPct: 100 });
    const dilini = a.people.find((p) => p.name === "Dilini")!;
    expect(dilini).toMatchObject({ meetingsSpoke: 1, participationPct: 50 });
  });
  it("averages balance and counts silent attendees", () => {
    expect(a.avgBalance).toBeGreaterThan(0.7);
    expect(a.silentAttendees).toBe(1);
    expect(a.avgSpeakers).toBe(2.5);
  });
  it("shows a developer only their own row, and leads everyone's", () => {
    expect(forViewer(a, "nuwan", false).people.map((p) => p.name)).toEqual(["Nuwan"]);
    expect(forViewer(a, "nuwan", true).people).toHaveLength(3);
    expect(forViewer(a, "nuwan", false).meetings).toBe(2); // team totals stay
  });
  it("handles an empty period", () => { expect(aggregate("x", [])).toMatchObject({ meetings: 0, avgBalance: null, people: [] }); });
});

describe("helpers", () => {
  it("labels balance", () => { expect(toneForBalance(0.9)).toBe("Balanced"); expect(toneForBalance(0.6)).toBe("Somewhat uneven"); expect(toneForBalance(0.2)).toMatch(/dominate/); expect(toneForBalance(null)).toBe("n/a"); });
  it("groups by month in the team timezone", () => { expect(monthKey(new Date("2026-10-31T20:00:00Z"), "Asia/Colombo")).toBe("2026-11"); expect(monthKey(new Date("2026-10-31T20:00:00Z"), "UTC")).toBe("2026-10"); });
});
