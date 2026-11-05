import { afterEach, describe, expect, it, vi } from "vitest";
import { profileStats, topicsOf, type DoneTicket } from "../src/lib/insights-calc";
import { askAI, normalizeSchema, type AiKey } from "../src/lib/ai";
import { summariseWithClaude, parseNotes } from "../src/lib/notes";

const A: AiKey = { key: "sk-ant-user", provider: "anthropic", model: "claude-test", source: "user" };
const t = (o: Partial<DoneTicket>): DoneTicket => ({ key: "A-1", title: "Thing", type: "TASK", labels: [], points: 3, estimateHrs: 8, actualHrs: 8, sprintId: "s1", assigneeId: "d1", ...o });

describe("topicsOf", () => {
  it("finds topics from title and labels", () => {
    expect(topicsOf({ title: "Fix XSS in profile form", labels: [] })).toEqual(expect.arrayContaining(["security", "frontend"]));
    expect(topicsOf({ title: "Dunning emails", labels: ["billing"] })).toContain("billing");
    expect(topicsOf({ title: "Rename things", labels: [] })).toEqual([]);
  });
});

describe("profileStats", () => {
  const team = [
    t({ assigneeId: "d2", title: "Auth token rotation", points: 3, actualHrs: 6, sprintId: "s1" }),
    t({ assigneeId: "d2", title: "SSO permission check", points: 5, actualHrs: 10, sprintId: "s2" }),
    t({ assigneeId: "d3", title: "Security headers", points: 2, actualHrs: 4, sprintId: "s2" }),
  ];
  it("needs at least two sprints of finished tickets", () => {
    const one = [t({ title: "UI a", sprintId: "s1" }), t({ title: "UI b", sprintId: "s1" }), t({ title: "UI c", sprintId: "s1" })];
    const s = profileStats("d1", [...one, ...team]);
    expect(s.eligible).toBe(false);
    expect(s.sprintsCovered).toBe(1);
  });
  it("flags a topic where the developer is much slower than the team", () => {
    const mine = [
      t({ title: "Security audit", points: 3, actualHrs: 14, sprintId: "s1" }),
      t({ title: "Auth hardening", points: 3, actualHrs: 16, sprintId: "s2" }),
      t({ title: "Footer link", points: 1, actualHrs: 2, sprintId: "s2" }),
    ];
    const s = profileStats("d1", [...mine, ...team]);
    expect(s.eligible).toBe(true);
    const sec = s.topics.find((x) => x.topic === "security")!;
    expect(sec.signal).toBe("slower");
    expect(sec.relativeSpeed).toBeGreaterThan(1.3);
  });
  it("does not conclude from a single ticket", () => {
    const mine = [t({ title: "Security audit", points: 3, actualHrs: 30, sprintId: "s1" }), t({ title: "Footer link", sprintId: "s2" }), t({ title: "Header", sprintId: "s2" })];
    const sec = profileStats("d1", [...mine, ...team]).topics.find((x) => x.topic === "security")!;
    expect(sec.signal).toBe("not enough data");
  });
});

describe("Claude calls", () => {
  afterEach(() => vi.unstubAllGlobals());
  const ok = (input: unknown, name = "t") => ({ ok: true, status: 200, json: async () => ({ model: "m", content: [{ type: "tool_use", name, input }] }), text: async () => "" });

  it("returns the tool input and sends the caller's key", async () => {
    const f = vi.fn().mockResolvedValue(ok({ a: 1 }));
    vi.stubGlobal("fetch", f);
    const r = await askAI(A, { system: "s", user: "u", tool: "t", description: "d", schema: { type: "object" } });
    expect(r.input).toEqual({ a: 1 });
    expect((f.mock.calls[0][1] as any).headers["x-api-key"]).toBe("sk-ant-user");
  });
  it("explains a rejected personal key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "" }));
    await expect(askAI(A, { system: "s", user: "u", tool: "t", description: "d", schema: {} })).rejects.toThrow(/Settings/);
  });
  it("meeting summary uses Claude when a key exists and falls back otherwise", async () => {
    const raw = "Amaya: We decided to ship Friday. I'll update ATL-1.";
    const base = parseNotes(raw, ["Amaya Perera"]);
    expect((await summariseWithClaude(raw, base, null)).ai).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ summary: "Ship Friday.", decisions: ["Ship Friday"], actionItems: [{ text: "Update ATL-1", owner: "Amaya" }], blockers: [] }, "submit_notes")));
    const withKey = await summariseWithClaude(raw, base, A);
    expect(withKey.ai).toBe(true);
    expect(withKey.summary).toBe("Ship Friday.");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));
    const failed = await summariseWithClaude(raw, base, A);
    expect(failed.ai).toBe(false);
    expect(failed.summary).toBe(base.summary);
  });
});

describe("AI providers", () => {
  afterEach(() => vi.unstubAllGlobals());
  const tool = { system: "s", user: "u", tool: "t", description: "d", schema: { type: "object", properties: { v: { enum: ["a", "b"] } } } };

  it("openai: sends a function call and reads the arguments", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ model: "gpt-x", choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify({ v: "a" }) } }] } }] }) });
    vi.stubGlobal("fetch", f);
    const r = await askAI({ key: "sk-open", provider: "openai", model: "gpt-4o", source: "user" }, tool);
    expect(r.input).toEqual({ v: "a" });
    const [url, init] = f.mock.calls[0] as [string, any];
    expect(url).toMatch(/\/v1\/chat\/completions$/);
    expect(init.headers.Authorization).toBe("Bearer sk-open");
    const body = JSON.parse(init.body);
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "t" } });
    expect(body.tools[0].function.parameters.properties.v.type).toBe("string"); // enum gets an explicit type
  });
  it("gemini: sends a function declaration and reads functionCall args", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ functionCall: { name: "t", args: { v: "b" } } }] } }] }) });
    vi.stubGlobal("fetch", f);
    const r = await askAI({ key: "AIzaKey", provider: "gemini", model: "gemini-2.0-flash", source: "user" }, tool);
    expect(r.input).toEqual({ v: "b" });
    const [url, init] = f.mock.calls[0] as [string, any];
    expect(url).toMatch(/models\/gemini-2\.0-flash:generateContent$/);
    expect(init.headers["x-goog-api-key"]).toBe("AIzaKey");
    expect(JSON.parse(init.body).toolConfig.functionCallingConfig).toEqual({ mode: "ANY", allowedFunctionNames: ["t"] });
  });
  it("names the right provider when a key is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "" }));
    await expect(askAI({ key: "x", provider: "gemini", model: "m", source: "user" }, tool)).rejects.toThrow(/Gemini.*Settings/);
  });
  it("normalizeSchema adds a type to enum-only fields, recursively", () => {
    const n = normalizeSchema({ type: "object", properties: { a: { enum: ["x"] }, b: { type: "array", items: { enum: ["y"] } } } });
    expect(n.properties.a.type).toBe("string");
    expect(n.properties.b.items.type).toBe("string");
  });
});
