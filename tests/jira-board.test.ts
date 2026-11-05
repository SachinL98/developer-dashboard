import { describe, expect, it } from "vitest";
import { statusFromJira, parseIssue, type JiraBoardInfo } from "../src/lib/integrations/jira";
import { columnIdFor, jiraColumns, workflowColumns } from "../src/lib/board-columns";
import { gateError, hoursForPoints, pointsForHours } from "../src/lib/workflow";

const info: JiraBoardInfo = {
  boardId: "1", fetchedAt: new Date().toISOString(), estimation: { mode: "points", field: "customfield_10016" },
  columns: [
    { name: "To Do", statuses: [{ id: "1", name: "To Do", category: "new" }, { id: "2", name: "Ready to Dev", category: "new" }] },
    { name: "Doing", statuses: [{ id: "3", name: "In Progress", category: "indeterminate" }] },
    { name: "Code review", statuses: [{ id: "4", name: "Initial Review", category: "indeterminate" }, { id: "5", name: "Review", category: "indeterminate" }] },
    { name: "Shipped", statuses: [{ id: "6", name: "Shipped to prod", category: "done" }] },
  ],
};

describe("status mapping", () => {
  it("prefers admin overrides, then names, then Jira's category", () => {
    expect(statusFromJira("Shipped to prod", {}, "done")).toBe("DEPLOYED_PROD");
    expect(statusFromJira("QA", { QA: "DEPLOYED_STG" })).toBe("DEPLOYED_STG");
    expect(statusFromJira("Blocked-ish", {}, "indeterminate")).toBe("IN_PROGRESS");
    expect(statusFromJira("Mystery", {})).toBeNull();
    expect(statusFromJira("Failed in Staging")).toBe("FAILED_STG");
  });
});

describe("real board columns", () => {
  const cols = jiraColumns(info, {});
  it("keeps Jira's column names and maps each to workflow statuses", () => {
    expect(cols.map((c) => c.label)).toEqual(["To Do", "Doing", "Code review", "Shipped"]);
    expect(cols[2].statuses).toEqual(["INITIAL_REVIEW", "REVIEW"]);
  });
  it("places a card by its Jira status, else by workflow status", () => {
    expect(columnIdFor({ status: "IN_PROGRESS", jiraStatus: "Review" }, cols)).toBe("jira:Code review");
    expect(columnIdFor({ status: "READY_TO_DEV", jiraStatus: null }, cols)).toBe("jira:To Do");
  });
  it("adds a Backlog column when no Jira column holds backlog", () => {
    const c = jiraColumns({ ...info, columns: info.columns.slice(1) }, {});
    expect(c[0].label).toBe("Backlog");
  });
  it("falls back to the 10 workflow columns", () => expect(workflowColumns()).toHaveLength(10));
});

describe("estimates", () => {
  it("accepts story points as an estimate at the Ready gate", () => {
    const ctx = { assigneeId: null, sprintId: "s", estimateHrs: null, storyPoints: 5, prUrl: null, initialReviewPassed: true };
    expect(gateError("BACKLOG", "READY_TO_DEV", ctx)).toBeNull();
    expect(gateError("BACKLOG", "READY_TO_DEV", { ...ctx, storyPoints: null })).toMatch(/Estimate/);
  });
  it("converts between points and hours consistently", () => {
    expect(pointsForHours(hoursForPoints(5))).toBe(5);
  });
  it("parses a webhook issue payload", () => {
    const i = parseIssue({ key: "ATL-1", fields: { summary: "x", issuetype: { name: "Bug" }, priority: { name: "High" }, status: { name: "In Progress", statusCategory: { key: "indeterminate" } }, customfield_10016: 3, timeoriginalestimate: 7200, labels: ["a"] } });
    expect(i).toMatchObject({ key: "ATL-1", type: "BUG", priority: "HIGH", points: 3, estimateHrs: 2, statusCategory: "indeterminate" });
  });
});

import { defaultWorkspace, nextSprintDefaults } from "../src/lib/config";
describe("sprint cadence defaults", () => {
  it("starts the next sprint on the configured weekday after the last one ends", () => {
    const cfg = { ...defaultWorkspace(), sprintLengthDays: 14, sprintStartWeekday: 1 };
    const r = nextSprintDefaults("Sprint 24", new Date("2026-10-23T12:00:00Z"), cfg); // Friday
    expect(r).toEqual({ name: "Sprint 25", start: "2026-10-26", end: "2026-11-08" }); // Mon → +13 days
  });
});

import { applyVerdicts, buildPrompt, passes } from "../src/lib/claude-review";
import { defaultReviewConfig, templateFor } from "../src/lib/review-config";
describe("Claude review", () => {
  const cfg = defaultReviewConfig();
  cfg.projects.ATL = { guidance: "Laravel app", items: [{ id: "x1", label: "Queues are idempotent", severity: "critical", enabled: true }, { id: "x2", label: "off", severity: "important", enabled: false }] };
  it("adds a project's points to the team checklist, namespaced", () => {
    const { items, guidance } = templateFor(cfg, "ATL");
    expect(items.find((i) => i.id === "p:x1")).toMatchObject({ severity: "critical", project: true });
    expect(items.some((i) => i.id === "p:x2")).toBe(false);
    expect(guidance).toBe("Laravel app");
    expect(templateFor(cfg, "NOV").items.some((i) => i.project)).toBe(false);
  });
  it("only counts known ids and leaves anything unassessed unchecked", () => {
    const { items } = templateFor(cfg, "ATL");
    const r = applyVerdicts(items, { summary: "ok", items: [{ id: "secrets", verdict: "pass" }, { id: "nope", verdict: "pass" }, { id: "authz", verdict: "unclear" }], findings: [] });
    expect(r.items.find((i) => i.id === "secrets")!.checked).toBe(true);
    expect(r.items.find((i) => i.id === "authz")).toMatchObject({ checked: false });
    expect(r.items.find((i) => i.id === "migrations")).toMatchObject({ checked: false, note: "Not assessed by Claude" });
  });
  it("passes only with every critical item clear and no critical finding", () => {
    const all = templateFor(cfg, "ATL").items.map((i) => ({ ...i, checked: true }));
    expect(passes(all, [])).toBe(true);
    expect(passes(all, [{ severity: "critical", title: "t", detail: "d" }])).toBe(false);
    expect(passes(all.map((i) => (i.severity === "critical" ? { ...i, checked: false } : i)), [])).toBe(false);
  });
  it("treats the diff as untrusted and truncates huge diffs", () => {
    const { system, user, truncated } = buildPrompt({ key: "ATL-1", title: "t", description: "", diff: "x".repeat(200_000), items: templateFor(cfg, "ATL").items, guidance: "g" });
    expect(system).toMatch(/untrusted/i); expect(truncated).toBe(true); expect(user).toContain("p:x1");
  });
});
