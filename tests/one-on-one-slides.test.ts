import { describe, expect, it } from "vitest";
import { oneOnOneSlides } from "../src/lib/one-on-one-slides";
import type { OneOnOneReport } from "../src/lib/one-on-one";

const base = {
  version: 1, monthKey: "2026-10", generatedAt: "2026-11-02T00:00:00Z", curLabel: "19 Oct to 1 Nov", baseLabel: "19 Sep to 18 Oct",
  rows: [{ key: "done", label: "Tickets done", unit: "", cur: 5, base: 4, deltaPct: 25, trend: "better" }],
  findings: { improved: ["More tickets done"], attention: [] }, done: [{ key: "A-1", title: "Fix login", type: "BUG", points: 3 }], pointsGaps: [], ai: null,
} as unknown as OneOnOneReport;

describe("oneOnOneSlides", () => {
  it("builds a deck from the numbers alone when there is no AI text", () => {
    const s = oneOnOneSlides(base, "Sam");
    expect(s[0].layout).toBe("title");
    expect(s.map((x) => x.id)).toEqual(["title", "scorecard", "wins", "grow", "done"]);
    expect(s.find((x) => x.id === "grow")).toMatchObject({ bullets: ["Nothing to worry about here. Keep going."] });
  });
  it("adds the AI slides when written analysis exists", () => {
    const r = { ...base, ai: { headline: "A strong fortnight.", wentWell: [{ point: "Shipped", evidence: "5 tickets" }], needsAttention: [], vsLastMonth: "Up.", previousSuggestions: [], suggestions: [{ title: "Split big cards", why: "w", how: "Do it", area: "estimation" }], talkingPoints: ["Pairing"], questionsForLead: [], focusNextMonth: ["Reviews"], estimateCheck: [{ key: "A-1", assignedPoints: 2, suggestedPoints: 5, verdict: "pointed_low", reason: "Bigger scope", tip: "" }] } } as OneOnOneReport;
    const ids = oneOnOneSlides(r, "Sam").map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["summary", "suggestions", "talking", "points", "focus", "vs-last"]));
    expect(ids).not.toContain("questions");
  });
});
