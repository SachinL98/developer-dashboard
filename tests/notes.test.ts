import { describe, expect, it } from "vitest";
import { parseNotes } from "../src/lib/notes";
import { parseTicketLines } from "../src/lib/ticket-parse";
import { occurrences } from "../src/lib/schedule";
import { scanDiff, reviewPassed, freshChecklist } from "../src/lib/review-template";
import { burndown, columnDwell } from "../src/lib/analytics";

describe("meeting notes", () => {
  const raw = `Amaya: Yesterday finished ATL-101. Today starting audit log. No blockers.
Nuwan: Yesterday worked on retries. Today code review. Blocked on staging credentials.
Sachin: We decided to hold usage tiers for next sprint.
Dilini: I'll write the tenant migration for ATL-105 tomorrow.`;
  const r = parseNotes(raw, ["Amaya Perera", "Nuwan Silva", "Dilini Fernando"]);
  it("extracts decisions, action items with owners and ticket keys, blockers", () => {
    expect(r.decisions.join(" ")).toMatch(/hold usage tiers/);
    const a = r.actionItems.find((x) => /tenant migration/.test(x.text))!;
    expect(a.owner).toBe("Dilini");
    expect(a.ticketKey).toBe("ATL-105");
    expect(r.blockers.join(" ")).toMatch(/staging credentials/);
    expect(r.ticketsMentioned).toEqual(["ATL-101", "ATL-105"]);
  });
  it("parses standup turns", () => {
    expect(r.standup?.find((s) => s.name === "Nuwan")?.blockers).toMatch(/staging/);
    expect(r.standup?.find((s) => s.name === "Amaya")?.blockers).toBe("");
  });
});

describe("ticket quick-capture", () => {
  it("parses prefixes, priority, labels and points; infers the rest", () => {
    const [a, b, c] = parseTicketLines("[bug] Checkout fails on Safari !critical #frontend (3)\n- Add CSV export\n2. Improve report speed");
    expect(a).toMatchObject({ type: "BUG", priority: "CRITICAL", labels: ["frontend"], storyPoints: 3, title: "Checkout fails on Safari" });
    expect(b.type).toBe("FEATURE");
    expect(c.type).toBe("ENHANCEMENT");
  });
});

describe("meeting schedule", () => {
  it("matches the team cadence (Asia/Colombo)", () => {
    // Mon 2026-10-12 → Sun: standup+grooming daily, estimation+plan Mon, summary Wed, demo Thu
    const occ = occurrences(new Date("2026-10-11T20:00:00Z"), 7); // Mon 01:30 local
    const count = (k: string) => occ.filter((o) => o.kind === k).length;
    expect(count("STANDUP")).toBe(5); expect(count("GROOMING")).toBe(5);
    expect(count("ESTIMATION")).toBe(1); expect(count("SPRINT_PLAN")).toBe(1); expect(count("WEEKLY_SUMMARY")).toBe(1); expect(count("DEMO")).toBe(1);
    const standup = occ.find((o) => o.kind === "STANDUP")!;
    expect(standup.startsAt.toISOString()).toBe("2026-10-12T03:15:00.000Z"); // 08:45 +05:30
    expect(occ.find((o) => o.kind === "WEEKLY_SUMMARY")!.startsAt.toISOString()).toBe("2026-10-14T11:30:00.000Z"); // Wed 17:00
  });
});

describe("review template", () => {
  it("passes only when every critical item is checked", () => {
    const items = freshChecklist();
    expect(reviewPassed(items)).toBe(false);
    expect(reviewPassed(items.map((i) => (i.severity === "critical" ? { ...i, checked: true } : i)))).toBe(true);
  });
  it("flags migrations, secrets and destructive SQL in a diff", () => {
    const diff = `diff --git a/db/migrations/001.sql b/db/migrations/001.sql\n+DROP TABLE users;\n+const apiKey = "abcdef1234567890abcd";\n`;
    const items = scanDiff(diff);
    const get = (id: string) => items.find((i) => i.id === id)!;
    expect(get("migrations").checked).toBe(false);
    expect(get("secrets").checked).toBe(false);
    expect(get("data-loss").checked).toBe(false);
  });
});

describe("analytics", () => {
  it("builds a burndown with ideal and actual lines", () => {
    const start = new Date("2026-10-12T00:00:00Z"), end = new Date("2026-10-16T00:00:00Z");
    const rows = burndown(start, end, [{ points: 5, hours: 10, doneAt: new Date("2026-10-13T10:00:00Z") }, { points: 5, hours: 10, doneAt: null }], new Date("2026-10-14T12:00:00Z"));
    expect(rows[0].idealPts).toBe(10);
    expect(rows[2].actualPts).toBe(5);
    expect(rows[4].actualPts).toBeNull(); // future
  });
  it("computes time spent in each column", () => {
    const t0 = new Date("2026-10-12T00:00:00Z");
    const d = columnDwell([{ ticketId: "a", from: "BACKLOG", to: "READY_TO_DEV", at: new Date(+t0 + 3600_000) }, { ticketId: "a", from: "READY_TO_DEV", to: "IN_PROGRESS", at: new Date(+t0 + 3 * 3600_000) }], { a: t0 });
    expect(d.BACKLOG).toBeCloseTo(1); expect(d.READY_TO_DEV).toBeCloseTo(2);
  });
});
