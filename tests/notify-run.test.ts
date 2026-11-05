import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const db: any = {
    developer: { findMany: vi.fn() }, workSession: { findMany: vi.fn() }, timeEntry: { findMany: vi.fn() }, ticket: { findMany: vi.fn() }, sprint: { findMany: vi.fn() },
    notificationLog: { findUnique: vi.fn(), upsert: vi.fn(), create: vi.fn() },
  };
  return { db, sendEmail: vi.fn(), sendDiscord: vi.fn(), settings: new Map<string, unknown>(), leaves: [] as any[] };
});
vi.mock("../src/lib/db", () => ({ db: h.db }));
vi.mock("../src/lib/config", () => ({ getWorkspace: async () => ({ timezone: "Asia/Colombo", workStart: "09:00", workEnd: "17:30" }) }));
vi.mock("../src/lib/settings", () => ({ getSetting: async (k: string) => h.settings.get(k) ?? null, setSetting: async (k: string, v: unknown) => { h.settings.set(k, v); } }));
vi.mock("../src/lib/leave", () => ({ approvedLeave: async () => h.leaves, getHolidays: async () => [] }));
vi.mock("../src/lib/notify/email", async (orig) => ({ ...(await orig<typeof import("../src/lib/notify/email")>()), emailProvider: () => "zeptomail", sendEmail: h.sendEmail }));
vi.mock("../src/lib/notify/discord", async (orig) => ({ ...(await orig<typeof import("../src/lib/notify/discord")>()), discordRoute: () => "dm", sendDiscord: h.sendDiscord }));

import { runNotifications } from "../src/lib/notify/run";

const person = (id: string, name: string) => ({ id, name, email: `${id}@x.com`, discordId: "123456789012345678", notifyEmail: true, notifyDiscord: true });
// 10:30 in Colombo on Thursday 5 Nov 2026
const NOW = new Date("2026-11-05T05:00:00Z");

beforeEach(() => {
  vi.clearAllMocks(); h.settings.clear(); h.leaves = [];
  h.db.developer.findMany.mockResolvedValue([person("a", "Amaya Perera"), person("b", "Nuwan Silva"), person("c", "Dilini Fernando")]);
  h.db.workSession.findMany.mockResolvedValue([{ developerId: "b" }]);
  h.db.timeEntry.findMany.mockResolvedValue([]);
  h.db.ticket.findMany.mockResolvedValue([]);
  h.db.sprint.findMany.mockResolvedValue([]);
  h.db.notificationLog.findUnique.mockResolvedValue(null);
  h.sendEmail.mockResolvedValue({ provider: "zeptomail" }); h.sendDiscord.mockResolvedValue({ route: "dm" });
});

describe("start-of-day reminders", () => {
  it("reminds only people who have not started, on email and Discord", async () => {
    h.leaves = [{ developerId: "c", start: "2026-11-05", end: "2026-11-05", portion: "FULL" }];
    const r = await runNotifications(NOW, { force: true });
    expect(r).toMatchObject({ ran: true, reminders: 1 }); // a has not started; b has; c is on leave
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.sendEmail.mock.calls[0][0]).toMatchObject({ to: "a@x.com", subject: "Please start your work day timer" });
    expect(h.sendDiscord).toHaveBeenCalledWith(expect.objectContaining({ userId: "123456789012345678" }));
  });
  it("treats a running ticket timer as having started", async () => {
    h.db.timeEntry.findMany.mockResolvedValue([{ developerId: "a" }]);
    expect((await runNotifications(NOW, { force: true })).reminders).toBe(1); // only c now
    expect(h.sendEmail.mock.calls[0][0].to).toBe("c@x.com");
  });
  it("waits for the half hour, and does nothing at the weekend", async () => {
    expect((await runNotifications(new Date("2026-11-05T03:25:00Z"), { force: true })).reminders).toBe(0); // 08:55... before 09:30 local
    expect((await runNotifications(new Date("2026-11-05T03:50:00Z"), { force: true })).reminders).toBe(0); // 09:20 local, inside the grace period
    expect(await runNotifications(new Date("2026-11-07T05:00:00Z"), { force: true })).toMatchObject({ reminders: 0, note: "not a working day" });
  });
  it("sends once a day: a logged reminder is not repeated, but a failed one is retried later", async () => {
    h.db.notificationLog.findUnique.mockResolvedValue({ status: "sent", createdAt: NOW });
    expect((await runNotifications(NOW, { force: true })).reminders).toBe(0);
    h.db.notificationLog.findUnique.mockResolvedValue({ status: "failed", createdAt: new Date(NOW.getTime() - 5 * 60_000) });
    expect((await runNotifications(NOW, { force: true })).reminders).toBe(0); // too soon
    h.db.notificationLog.findUnique.mockResolvedValue({ status: "failed", createdAt: new Date(NOW.getTime() - 30 * 60_000) });
    expect((await runNotifications(NOW, { force: true })).reminders).toBeGreaterThan(0);
  });
  it("respects each person's own switches and channel failures", async () => {
    h.db.developer.findMany.mockResolvedValue([{ ...person("a", "Amaya Perera"), notifyEmail: false }]);
    h.sendDiscord.mockRejectedValue(new Error("boom"));
    await runNotifications(NOW, { force: true });
    expect(h.sendEmail).not.toHaveBeenCalled();
    const log = h.db.notificationLog.upsert.mock.calls[0][0].create;
    expect(log).toMatchObject({ status: "failed", kind: "START_REMINDER", dayKey: "2026-11-05" });
    expect(log.channels.email).toBe("off"); expect(log.channels.discord).toMatch(/failed: boom/);
  });
});

describe("overdue digest", () => {
  it("sends one digest per person listing their overdue tickets", async () => {
    h.db.workSession.findMany.mockResolvedValue([{ developerId: "a" }, { developerId: "b" }, { developerId: "c" }]);
    h.db.ticket.findMany.mockResolvedValue([
      { id: "t1", key: "A-1", title: "Late one", status: "IN_PROGRESS", assigneeId: "a", dueDate: new Date("2026-11-01T12:00:00Z"), sprintId: null },
      { id: "t2", key: "A-2", title: "Fine", status: "IN_PROGRESS", assigneeId: "b", dueDate: new Date("2026-11-20T12:00:00Z"), sprintId: null },
    ]);
    const r = await runNotifications(NOW, { force: true });
    expect(r).toMatchObject({ overdue: 1, reminders: 0 });
    expect(h.sendEmail.mock.calls[0][0]).toMatchObject({ to: "a@x.com", subject: "You have 1 overdue ticket" });
  });
  it("can be switched off by an admin", async () => {
    h.settings.set("notify.config", { overdue: false, startReminder: false, graceMin: 30 });
    expect(await runNotifications(NOW, { force: true })).toMatchObject({ overdue: 0, reminders: 0 });
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
});
