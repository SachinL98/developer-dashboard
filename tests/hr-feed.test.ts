import { describe, expect, it } from "vitest";
import { feedToHolidays, feedToLeave, wfhDays, type HrFeed } from "../src/lib/hr-feed";

const feed: HrFeed = {
  members: [{ id: "m1", email: "a@x.com", name: "A" }],
  days: [
    { email: "a@x.com", date: "2026-03-02", part: "FULL", type: "LEAVE" },
    { email: "a@x.com", date: "2026-03-03", part: "AM", type: "LEAVE" },
    { email: "a@x.com", date: "2026-03-04", part: "FULL", type: "WFH" },
    { email: "ghost@x.com", date: "2026-03-02", part: "FULL", type: "LEAVE" },
  ],
  holidays: [{ date: "2026-05-01", name: "May Day" }, { date: "2026-04-13", name: "New Year" }],
};

describe("HR feed mapping", () => {
  it("turns leave into leave entries, halves for AM/PM, skips WFH and unknown people", () => {
    const out = feedToLeave(feed, new Map([["a@x.com", "dev1"]]));
    expect(out).toEqual([
      { developerId: "dev1", start: "2026-03-02", end: "2026-03-02", portion: "FULL" },
      { developerId: "dev1", start: "2026-03-03", end: "2026-03-03", portion: "HALF" },
    ]);
  });
  it("sorts holidays and lists WFH days", () => {
    expect(feedToHolidays(feed).map((h) => h.date)).toEqual(["2026-04-13", "2026-05-01"]);
    expect(wfhDays(feed, "A@x.com")).toEqual(["2026-03-04"]);
  });
});
