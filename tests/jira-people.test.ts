import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const m = () => ({ updateMany: vi.fn().mockResolvedValue({ count: 0 }), deleteMany: vi.fn().mockResolvedValue({ count: 0 }), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) });
  return {
  developer: { findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
  estimateVote: m(), ticket: m(), transition: m(), workSession: m(), timeEntry: m(), leave: m(), meetingSpeaker: m(), speakerAlias: m(),
  notification: m(), notificationLog: m(), auditLog: m(), aiInsight: m(), bugOrigin: m(),
  connection: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
  avatarImage: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
  $transaction: vi.fn(async (arg: unknown) => (typeof arg === "function" ? (arg as (t: unknown) => unknown)(db) : arg)),
  };
});
vi.mock("../src/lib/db", () => ({ db }));
vi.mock("../src/lib/config", () => ({ getWorkspace: async () => ({ defaultCapacityHrs: 30 }) }));

import { ensureJiraPerson, isPlaceholderEmail, mergePeople, placeholderEmail, reconcileJiraPeople, syncJiraPeople } from "../src/lib/jira-people";

beforeEach(() => {
  vi.clearAllMocks();
  db.developer.findFirst.mockResolvedValue(null);
  db.developer.findUnique.mockResolvedValue(null);
  db.developer.findMany.mockResolvedValue([]);
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

const real = (id: string, name: string, over: object = {}) => ({ id, name, email: `${id}@x.com`, passwordHash: "scrypt$h", jiraAccount: null, ...over });
const fromJira = (id: string, name: string) => ({ id, name, email: `jira-${id}@users.jira.invalid`, passwordHash: null, jiraAccount: `acc-${id}` });

describe("same person under two entries", () => {
  it("a new Jira person with the full name of an existing account is linked to it, not duplicated", async () => {
    db.developer.findMany.mockResolvedValue([real("me", "Sachin Lakshan")]);
    await ensureJiraPerson({ accountId: "acc-9", name: "sachin  lakshan" });
    expect(db.developer.update).toHaveBeenCalledWith({ where: { id: "me" }, data: { jiraAccount: "acc-9" } });
    expect(db.developer.create).not.toHaveBeenCalled();
  });
  it("does not guess when two accounts share the name", async () => {
    db.developer.findMany.mockResolvedValue([real("a", "Nuwan Silva"), real("b", "Nuwan Silva")]);
    await ensureJiraPerson({ accountId: "acc-8", name: "Nuwan Silva" });
    expect(db.developer.create).toHaveBeenCalledTimes(1);
  });
  it("merges tickets, time and history into the account and removes the duplicate", async () => {
    db.developer.findUniqueOrThrow.mockImplementation(async (a: any) => (a.where.id === "dup" ? fromJira("dup", "Sachin Lakshan") : real("me", "Sachin Lakshan")));
    db.ticket.count.mockResolvedValue(38);
    const r = await mergePeople("dup", "me");
    expect(db.ticket.updateMany).toHaveBeenCalledWith({ where: { assigneeId: "dup" }, data: { assigneeId: "me" } });
    expect(db.timeEntry.updateMany).toHaveBeenCalledWith({ where: { developerId: "dup" }, data: { developerId: "me" } });
    expect(db.meetingSpeaker.updateMany).toHaveBeenCalledWith({ where: { developerId: "dup" }, data: { developerId: "me" } });
    expect(db.developer.delete).toHaveBeenCalledWith({ where: { id: "dup" } });
    expect(db.developer.update).toHaveBeenCalledWith({ where: { id: "me" }, data: expect.objectContaining({ jiraAccount: "acc-dup" }) });
    expect(r.tickets).toBe(38);
  });
  it("never merges away a person the HR app owns, or two HR people, or a person into themself", async () => {
    db.developer.findUniqueOrThrow.mockImplementation(async (a: any) => (a.where.id === "x" ? real("x", "A", { hrManaged: true }) : real("y", "B", { hrManaged: a.where.id === "z" })));
    await expect(mergePeople("x", "y")).rejects.toThrow(/owned by the HR app/);
    db.developer.findUniqueOrThrow.mockImplementation(async (a: any) => real(a.where.id, "N", { hrManaged: true }));
    await expect(mergePeople("x", "y")).rejects.toThrow(/different people/);
    await expect(mergePeople("y", "y")).rejects.toThrow(/different/);
  });
  it("can merge one ordinary account into another, carrying over links the kept one lacks", async () => {
    db.developer.findUniqueOrThrow.mockImplementation(async (a: any) => (a.where.id === "dup" ? real("dup", "ishara", { githubLogin: "ish", jiraAccount: null }) : real("keep", "Ishara Sandaruwan", { jiraAccount: "acc-k", hrManaged: true })));
    db.ticket.count.mockResolvedValue(3);
    await mergePeople("dup", "keep");
    expect(db.developer.delete).toHaveBeenCalledWith({ where: { id: "dup" } });
    expect(db.developer.update).toHaveBeenCalledWith({ where: { id: "keep" }, data: expect.objectContaining({ jiraAccount: "acc-k", githubLogin: "ish" }) });
  });
  it("reconcile merges only unambiguous same-name pairs", async () => {
    db.developer.findMany.mockResolvedValue([fromJira("j1", "Sachin Lakshan"), real("me", "Sachin Lakshan"), fromJira("j2", "Nuwan Silva"), real("n1", "Nuwan Silva"), real("n2", "Nuwan Silva")]);
    db.developer.findUniqueOrThrow.mockImplementation(async (a: any) => [fromJira("j1", "Sachin Lakshan"), real("me", "Sachin Lakshan")].find((d) => d.id === a.where.id)!);
    expect(await reconcileJiraPeople()).toEqual({ merged: 1 });
  });
});
