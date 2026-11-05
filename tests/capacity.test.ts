import { describe, expect, it } from "vitest";
import { availability, checkRequest, eachDay, forecastCards, forecastFinish, isWorkday, requestDays, type Holiday, type LeaveLite } from "@/lib/capacity";

// 2026-10-05 is a Monday.
const hol: Holiday[] = [{ date: "2026-10-07", name: "Poya" }];
const leave = (start: string, end: string, portion: "FULL" | "HALF" = "FULL", developerId = "a"): LeaveLite => ({ developerId, start, end, portion });

describe("availability", () => {
  it("is the full week with no leave", () => {
    const a = availability(30, "2026-10-05", "2026-10-11", [], "a", []);
    expect(a.workdays).toBe(5); expect(a.hours).toBe(30); expect(a.lostHours).toBe(0);
  });
  it("removes approved leave, half days and public holidays", () => {
    const a = availability(30, "2026-10-05", "2026-10-11", [leave("2026-10-08", "2026-10-08"), leave("2026-10-09", "2026-10-09", "HALF")], "a", hol);
    expect(a.holidayDays).toBe(1); expect(a.leaveDays).toBe(1.5); expect(a.availableDays).toBe(2.5); expect(a.hours).toBe(15); expect(a.lostHours).toBe(15);
  });
  it("does not double count leave on a holiday or weekend, or other people's leave", () => {
    const a = availability(30, "2026-10-05", "2026-10-11", [leave("2026-10-07", "2026-10-11"), leave("2026-10-05", "2026-10-05", "FULL", "b")], "a", hol);
    expect(a.leaveDays).toBe(2); // Thu and Fri only
    expect(a.hours).toBe(12);
  });
  it("caps overlapping leave at one day", () => {
    const a = availability(40, "2026-10-05", "2026-10-05", [leave("2026-10-05", "2026-10-05"), leave("2026-10-05", "2026-10-05", "HALF")], "a", []);
    expect(a.leaveDays).toBe(1); expect(a.hours).toBe(0);
  });
});

describe("forecastFinish", () => {
  it("skips weekends, holidays and leave", () => {
    expect(forecastFinish("2026-10-05", 12, 6, [], "a", [])).toBe("2026-10-06");
    expect(forecastFinish("2026-10-05", 12, 6, [leave("2026-10-06", "2026-10-06")], "a", [])).toBe("2026-10-07");
    expect(forecastFinish("2026-10-05", 30, 6, [], "a", [])).toBe("2026-10-09");
    expect(forecastFinish("2026-10-05", 36, 6, [], "a", [])).toBe("2026-10-12"); // spills past the weekend
    expect(forecastFinish("2026-10-05", 18, 6, [], "a", hol)).toBe("2026-10-08");
  });
  it("handles zero work and zero capacity", () => {
    expect(forecastFinish("2026-10-05", 0, 6, [], "a", [])).toBe("2026-10-05");
    expect(forecastFinish("2026-10-05", 5, 0, [], "a", [])).toBeNull();
  });
});

describe("forecastCards", () => {
  it("flags cards that slip past the sprint end because of leave, in priority order", () => {
    const rows = forecastCards([{ id: "t1", assigneeId: "a", remainingHrs: 12 }, { id: "t2", assigneeId: "a", remainingHrs: 12 }, { id: "t3", assigneeId: null, remainingHrs: 5 }],
      [{ id: "a", capacityHrs: 30 }], "2026-10-05", "2026-10-09", [leave("2026-10-07", "2026-10-09")], []);
    expect(rows.map((r) => [r.ticketId, r.late])).toEqual([["t1", false], ["t2", true]]);
    expect(rows[0].leaveInSprint).toBe(3);
  });
});

describe("requests", () => {
  const ok = { type: "ANNUAL", start: "2026-10-12", end: "2026-10-14", portion: "FULL" as const, reason: "" };
  it("counts working days", () => {
    expect(requestDays("2026-10-09", "2026-10-13", "FULL", [])).toBe(3);
    expect(requestDays("2026-10-07", "2026-10-07", "HALF", [])).toBe(0.5);
    expect(requestDays("2026-10-10", "2026-10-11", "FULL", [])).toBe(0);
    expect(eachDay("2026-10-30", "2026-11-02")).toHaveLength(4);
    expect(isWorkday("2026-10-10")).toBe(false);
  });
  it("validates", () => {
    const today = "2026-10-14";
    expect(checkRequest(ok, [], [], today)).toBeNull();
    expect(checkRequest({ ...ok, end: "2026-10-10" }, [], [], today)).toMatch(/before/);
    expect(checkRequest({ ...ok, start: "2026-08-01", end: "2026-08-02" }, [], [], today)).toMatch(/30 days/);
    expect(checkRequest({ ...ok, portion: "HALF" }, [], [], today)).toMatch(/single date/);
    expect(checkRequest({ ...ok, start: "2026-10-17", end: "2026-10-18" }, [], [], today)).toMatch(/no working days/);
    expect(checkRequest(ok, [{ start: "2026-10-13", end: "2026-10-20", status: "APPROVED" }], [], today)).toMatch(/overlaps/);
    expect(checkRequest(ok, [{ start: "2026-10-13", end: "2026-10-20", status: "REJECTED" }], [], today)).toBeNull();
    expect(checkRequest({ ...ok, start: "2026-02-30" }, [], [], today)).toMatch(/valid dates/);
  });
});

import { idleWorkdays, paceModel } from "@/lib/pace";

describe("leave-aware pace", () => {
  // Sprint Mon 2026-10-05 to Fri 2026-10-16 (10 working days), two developers with 40h/week.
  const devs = [{ id: "a", capacityHrs: 40 }, { id: "b", capacityHrs: 40 }];
  const base = { start: "2026-10-05", end: "2026-10-16", dayFrac: 0, devs, holidays: [] as Holiday[] };

  it("matches a plain calendar when nobody is away", () => {
    const p = paceModel({ ...base, today: "2026-10-12", leaves: [] });
    expect(p.elapsedPct).toBeCloseTo(50, 0);
    expect(p.perDev.a.expectedPct).toBeCloseTo(50, 0);
    expect(p.workdaysLeft).toBe(5);
  });
  it("expects less progress from someone who has been on leave", () => {
    // a is away the whole first week, so by Mon 12 Oct none of a's available time has been used.
    const p = paceModel({ ...base, today: "2026-10-12", leaves: [leave("2026-10-05", "2026-10-09", "FULL", "a")] });
    expect(p.perDev.a.expectedPct).toBeCloseTo(0, 0);
    expect(p.perDev.b.expectedPct).toBeCloseTo(50, 0);
    expect(p.perDev.a.leaveDays).toBe(5);
    expect(p.elapsedPct).toBeLessThan(50); // team has used less than half of its available time
  });
  it("makes the ideal burndown flat while the team is away and keeps it reaching zero", () => {
    const p = paceModel({ ...base, today: "2026-10-05", leaves: [leave("2026-10-07", "2026-10-07", "FULL", "a"), leave("2026-10-07", "2026-10-07", "FULL", "b")] });
    const i = p.dates.indexOf("2026-10-07");
    expect(p.idealRemaining[i]).toBeCloseTo(p.idealRemaining[i - 1], 5);
    expect(p.idealRemaining.at(-1)).toBeCloseTo(0, 5);
  });
  it("skips public holidays and reports leave today", () => {
    const p = paceModel({ ...base, today: "2026-10-07", leaves: [leave("2026-10-07", "2026-10-07", "HALF", "a")], holidays: [{ date: "2026-10-08", name: "Poya" }] });
    expect(p.perDev.a.awayToday).toBe(0.5);
    expect(p.perDev.a.holidayDays).toBe(1);
  });
});

describe("idleWorkdays", () => {
  it("does not count weekends, holidays or days on leave", () => {
    // Last active Fri 9 Oct; today Wed 14 Oct. Mon 12 is a holiday, Tue 13 is leave -> only Wed counts.
    expect(idleWorkdays("2026-10-09", "2026-10-14", "a", [leave("2026-10-13", "2026-10-13")], [{ date: "2026-10-12", name: "H" }])).toBe(1);
  });
  it("counts normal working days", () => {
    expect(idleWorkdays("2026-10-08", "2026-10-12", "a", [], [])).toBe(2); // Fri + Mon
  });
});
