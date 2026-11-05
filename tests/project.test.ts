import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ project: { count: vi.fn(), upsert: vi.fn() } }));
vi.mock("../src/lib/db", () => ({ db }));
vi.mock("../src/lib/config", () => ({ getWorkspace: async () => ({ jira: { projectKey: "" } }), getMeetingDefs: async () => [] }));
vi.mock("../src/lib/settings", () => ({ getSetting: async () => null, setSetting: async () => {} }));
vi.mock("../src/lib/integrations/jira", () => ({}));
vi.mock("../src/lib/integrations/github", () => ({}));
vi.mock("../src/lib/integrations/google", () => ({}));
vi.mock("../src/lib/integrations/meet", () => ({ fetchTranscript: async () => null, meetCodeFromUrl: () => null }));
vi.mock("../src/lib/ai", () => ({ aiKeyFor: async () => null }));

import { ensureProject } from "../src/lib/services";

beforeEach(() => { vi.clearAllMocks(); db.project.count.mockResolvedValue(2); db.project.upsert.mockImplementation(async (a: any) => ({ id: "p1", ...a.create })); });

describe("ensureProject", () => {
  it("creates the project for a Jira key on first use, with a normalised key", async () => {
    const p = await ensureProject(" seam ");
    expect(db.project.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: "SEAM" }, update: {} }));
    expect(p).toMatchObject({ key: "SEAM", name: "SEAM" });
    expect(p.color).toMatch(/^#/);
  });
});
