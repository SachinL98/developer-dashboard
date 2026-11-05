import { describe, expect, it } from "vitest";
import { buildScorecard, dayOfMonth, findings, inFirstWeek, monthKeyOf, windows, type PeriodFacts } from "../src/lib/one-on-one-calc";

const f = (over: Partial<PeriodFacts> = {}): PeriodFacts => ({
  label: "x", days: 14, ticketsDone: 4, pointsDone: 12, ticketsInFlight: 2, bugsFixed: 1, hoursWorked: 70, hoursTracked: 42, daysWorked: 9, avgStartMin: 540, leaveDays: 0,
  cycleDays: 4, estimateAccuracy: 1.1, stagingFailures: 1, reviewFirstPassPct: 60, reviewRounds: 1.8, meetingsSpoke: 5, talkMin: 6, talkSharePct: 18, ...over });
const row = (rows: ReturnType<typeof buildScorecard>, key: string) => rows.find((r) => r.key === key)!;

describe("buildScorecard", () => {
  it("compares counts per two weeks, because the earlier period is 30 days long", () => {
    const rows = buildScorecard(f({ ticketsDone: 4 }), f({ days: 30, ticketsDone: 6 })); // 6 in 30 days = 2.8 per two weeks
    expect(row(rows, "ticketsDone")).toMatchObject({ cur: 4, base: 2.8, trend: "better" });
  });
  it("judges direction per measure: faster cycle and fewer failures are better", () => {
    const rows = buildScorecard(f({ cycleDays: 3, stagingFailures: 0, reviewFirstPassPct: 80 }), f({ days: 30, cycleDays: 5, stagingFailures: 3, reviewFirstPassPct: 50 }));
    expect(row(rows, "cycleDays").trend).toBe("better");
    expect(row(rows, "stagingFailures").trend).toBe("better");
    expect(row(rows, "reviewFirstPassPct").trend).toBe("better");
  });
  it("flags what got worse", () => {
    const rows = buildScorecard(f({ ticketsDone: 1, cycleDays: 8 }), f({ days: 30, ticketsDone: 9, cycleDays: 4 }));
    expect(row(rows, "ticketsDone").trend).toBe("worse");
    expect(row(rows, "cycleDays").trend).toBe("worse");
  });
  it("treats estimate accuracy as better when it moves toward 1", () => {
    expect(row(buildScorecard(f({ estimateAccuracy: 1.05 }), f({ days: 30, estimateAccuracy: 1.5 })), "estimateAccuracy").trend).toBe("better");
    expect(row(buildScorecard(f({ estimateAccuracy: 1.6 }), f({ days: 30, estimateAccuracy: 1.1 })), "estimateAccuracy").trend).toBe("worse");
  });
  it("calls small changes steady and does not judge neutral measures", () => {
    const rows = buildScorecard(f({ ticketsDone: 4 }), f({ days: 30, ticketsDone: 9 })); // 4.2 per two weeks
    expect(row(rows, "ticketsDone").trend).toBe("same");
    expect(row(buildScorecard(f({ hoursWorked: 90 }), f({ days: 30, hoursWorked: 100 })), "hoursWorked").trend).toBe("same");
    expect(row(buildScorecard(f({ hoursWorked: 120 }), f({ days: 30, hoursWorked: 60 })), "hoursWorked").trend).toBe("same"); // hours are context, not good or bad
  });
  it("has no comparison without a baseline or when data is missing", () => {
    expect(row(buildScorecard(f(), null), "ticketsDone").trend).toBe("n/a");
    expect(row(buildScorecard(f({ cycleDays: null }), f({ days: 30 })), "cycleDays").trend).toBe("n/a");
  });
  it("computes time tracked as a share of hours worked", () => { expect(row(buildScorecard(f({ hoursWorked: 80, hoursTracked: 40 }), null), "trackedPct").cur).toBe(50); });
});

describe("findings", () => {
  it("lists clear improvements and concerns only, with the numbers", () => {
    const r = findings(buildScorecard(f({ ticketsDone: 8, cycleDays: 9 }), f({ days: 30, ticketsDone: 6, cycleDays: 4 })));
    expect(r.improved.join(" ")).toMatch(/Tickets finished: 2.8 → 8/);
    expect(r.attention.join(" ")).toMatch(/Average days from start to done: 4 d → 9 d \(\+125%\)/);
  });
});

describe("windows and months", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  it("uses the last 14 days and the 30 before", () => {
    const w = windows(now);
    expect(w.cur.start.toISOString()).toBe("2026-10-22T10:00:00.000Z");
    expect(w.base.start.toISOString()).toBe("2026-09-22T10:00:00.000Z");
    expect(w.base.end.getTime()).toBe(w.cur.start.getTime());
  });
  it("knows the first week of the month in the team timezone", () => {
    expect(inFirstWeek(now, "UTC")).toBe(true);
    expect(inFirstWeek(new Date("2026-11-08T10:00:00Z"), "UTC")).toBe(false);
    expect(dayOfMonth(new Date("2026-10-31T20:00:00Z"), "Asia/Colombo")).toBe(1);
    expect(monthKeyOf(new Date("2026-10-31T20:00:00Z"), "Asia/Colombo")).toBe("2026-11");
  });
});
