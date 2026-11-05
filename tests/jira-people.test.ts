import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ developer: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() } }));
vi.mock("../src/lib/db", () => ({ db }));
vi.mock("../src/lib/config", () => ({ getWorkspace: async () => ({ defaultCapacityHrs: 30 }) }));

import { ensureJiraPerson, isPlaceholderEmail, placeholderEmail, syncJiraPeople } from "../src/lib/jira-people";

beforeEach(() => {
  vi.clearAllMocks();
  db.developer.findFirst.mockResolvedValue(null);
  db.developer.findUnique.mockResolvedValue(null);
  db.developer.count.mockResolvedValue(0);
  db.developer.create.mockImplementation(async (a: any) => ({ id: "new", passwordHash: null, active: true, ...a.data }));
  db.developer.update.mockImplementation(async (a: any) => ({ id: a.where.id, ...a.data }));
});

describe("ensureJiraPerson", () => {
  it("creates a person who has never signed in, with no password", async () => {
    const d: any = await ensureJiraPerson({ accountId: "acc-1", name: "Nimal Perera", email: "Nimal@Seamless.io" });
    const data = db.developer.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: "nimal@seamless.io", name: "Nimal Perera", jiraAccount: "acc-1", capacityHrs: 30 });
    expect(data.passwordHash).toBeUndefined();
    expect(d.id).toBe("new");
  });
  it("uses a placeholder email when Jira hides it, and it cannot collide with a real one", async () => {
    await ensureJiraPerson({ accountId: "5f1B:abc-9", name: "Hidden Person" });
    const email = db.developer.create.mock.calls[0][0].data.email;
    expect(email).toBe(placeholderEmail("5f1B:abc-9"));
    expect(isPlaceholderEmail(email)).toBe(true);
    expect(email.endsWith(".invalid")).toBe(true);
  });
  it("links an existing account by email without touching their name", async () => {
    db.developer.findUnique.mockResolvedValue({ id: "d1", email: "a@b.com", name: "Chosen Name", passwordHash: "scrypt$x", jiraAccount: null, active: true });
    await ensureJiraPerson({ accountId: "acc-2", name: "Jira Name", email: "a@b.com" });
    expect(db.developer.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { jiraAccount: "acc-2" } });
  });
  it("keeps a not-yet-signed-up person in step with Jira (name, real email, left the company)", async () => {
    db.developer.findFirst.mockResolvedValue({ id: "d2", email: placeholderEmail("acc-3"), name: "Old Name", passwordHash: null, jiraAccount: "acc-3", active: true });
    await ensureJiraPerson({ accountId: "acc-3", name: "New Name", email: "real@x.com", active: false });
    expect(db.developer.update).toHaveBeenCalledWith({ where: { id: "d2" }, data: { name: "New Name", email: "real@x.com", active: false } });
  });
  it("does not import someone who is already deactivated in Jira", async () => {
    expect(await ensureJiraPerson({ accountId: "acc-4", name: "Gone", active: false })).toBeNull();
    expect(db.developer.create).not.toHaveBeenCalled();
  });
});

describe("syncJiraPeople", () => {
  it("counts added and already-known people", async () => {
    db.developer.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    db.developer.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "x", passwordHash: "h", email: "k@x.com", name: "K", jiraAccount: "k", active: true });
    const r = await syncJiraPeople([{ accountId: "a", name: "A", email: "a@x.com" }, { accountId: "k", name: "K", email: "k@x.com" }]);
    expect(r).toEqual({ added: 1, existing: 1 });
  });
});
