import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { overdueMessage, overdueTickets, shouldRemindStart, shouldSendOverdue, startReminderMessage, type TicketLite } from "../src/lib/notify/rules";
import { emailProvider, renderEmail, sendEmail } from "../src/lib/notify/email";
import { discordRoute, sendDiscord, validDiscordId } from "../src/lib/notify/discord";

const TZ = "Asia/Colombo";
const t = (o: Partial<TicketLite> & { key: string }): TicketLite => ({ id: o.key, title: "A ticket", status: "IN_PROGRESS", assigneeId: "u1", dueDate: null, sprintId: null, ...o });

describe("overdueTickets", () => {
  const sprints = [{ id: "s1", name: "Sprint 24", state: "ACTIVE", endDate: new Date("2026-10-24T00:00:00Z") }, { id: "s2", name: "Sprint 25", state: "PLANNING", endDate: new Date("2026-10-01T00:00:00Z") }];
  const today = "2026-11-05";
  it("flags tickets past their due date", () => {
    const r = overdueTickets([t({ key: "A-1", dueDate: new Date("2026-11-01T12:00:00Z") }), t({ key: "A-2", dueDate: new Date("2026-11-05T12:00:00Z") }), t({ key: "A-3", dueDate: new Date("2026-11-09T12:00:00Z") })], sprints, today, TZ);
    expect(r.map((x) => [x.key, x.daysOverdue, x.reason])).toEqual([["A-1", 4, "due"]]); // due today is not overdue yet
  });
  it("flags unfinished work in a sprint that has ended, but not in one still being planned", () => {
    const r = overdueTickets([t({ key: "B-1", sprintId: "s1" }), t({ key: "B-2", sprintId: "s2" }), t({ key: "B-3", sprintId: "s1", status: "BACKLOG" })], sprints, today, TZ);
    expect(r.map((x) => [x.key, x.reason])).toEqual([["B-1", "sprint"]]);
    expect(r[0].daysOverdue).toBe(12);
  });
  it("ignores finished tickets and sorts the most overdue first", () => {
    const r = overdueTickets([t({ key: "C-1", status: "DONE", dueDate: new Date("2026-10-01T12:00:00Z") }), t({ key: "C-2", dueDate: new Date("2026-11-03T12:00:00Z") }), t({ key: "C-3", dueDate: new Date("2026-10-20T12:00:00Z") })], sprints, today, TZ);
    expect(r.map((x) => x.key)).toEqual(["C-3", "C-2"]);
  });
});

describe("start reminder rule", () => {
  const base = { workStart: "09:00", workEnd: "17:30", graceMin: 30, startedToday: false, awayFraction: 0, workingDay: true };
  it("waits half an hour after the work day starts", () => {
    expect(shouldRemindStart({ ...base, nowMin: 9 * 60 + 29 })).toBe(false);
    expect(shouldRemindStart({ ...base, nowMin: 9 * 60 + 30 })).toBe(true);
    expect(shouldRemindStart({ ...base, nowMin: 14 * 60 })).toBe(true);
  });
  it("stops at the end of the work day", () => { expect(shouldRemindStart({ ...base, nowMin: 17 * 60 + 30 })).toBe(false); });
  it("does not remind someone who has started, is on leave, or on a non-working day", () => {
    expect(shouldRemindStart({ ...base, nowMin: 600, startedToday: true })).toBe(false);
    expect(shouldRemindStart({ ...base, nowMin: 600, awayFraction: 1 })).toBe(false);
    expect(shouldRemindStart({ ...base, nowMin: 600, workingDay: false })).toBe(false);
  });
  it("sends the overdue digest only on working days, to people at work, when there is something overdue", () => {
    const o = { nowMin: 600, workStart: "09:00", workEnd: "17:30", awayFraction: 0, workingDay: true, count: 2 };
    expect(shouldSendOverdue(o)).toBe(true);
    expect(shouldSendOverdue({ ...o, count: 0 })).toBe(false);
    expect(shouldSendOverdue({ ...o, nowMin: 8 * 60 })).toBe(false);
    expect(shouldSendOverdue({ ...o, awayFraction: 1 })).toBe(false);
  });
});

describe("messages", () => {
  it("lists overdue tickets with days and caps the list", () => {
    const list = Array.from({ length: 12 }, (_, i) => ({ id: `${i}`, key: `A-${i}`, title: "Fix it", reason: (i === 0 ? "sprint" : "due") as "due" | "sprint", daysOverdue: 12 - i, since: "2026-10-01" }));
    const m = overdueMessage("Amaya Perera", list, "https://app.example");
    expect(m.subject).toBe("You have 12 overdue tickets");
    expect(m.items).toHaveLength(11);
    expect(m.items![0]).toContain("12 days overdue (sprint ended)");
    expect(m.intro).toContain("Hi Amaya");
    expect(m.discord).toContain("https://app.example/board");
  });
  it("tells someone to start the day, naming the time", () => {
    const m = startReminderMessage("Nuwan Silva", "09:00", 30, "https://app.example");
    expect(m.intro).toContain("09:00"); expect(m.intro).toContain("30 minutes"); expect(m.url).toBe("https://app.example/time");
  });
  it("renders email html safely", () => {
    const r = renderEmail({ title: "Hi <b>", intro: "x & y", items: ["<script>"], button: { label: "Go", url: "https://a.b" } });
    expect(r.html).not.toContain("<script>"); expect(r.html).toContain("&lt;script&gt;"); expect(r.text).toContain("Go: https://a.b");
  });
});

describe("email providers", () => {
  it("chooses ZeptoMail when its token is set, else Zoho SMTP, and respects a forced choice", () => {
    expect(emailProvider({ ZEPTOMAIL_TOKEN: "t", EMAIL_FROM: "a@b.com" } as any)).toBe("zeptomail");
    expect(emailProvider({ ZOHO_SMTP_USER: "u@b.com", ZOHO_SMTP_PASSWORD: "p" } as any)).toBe("zoho");
    expect(emailProvider({ ZEPTOMAIL_TOKEN: "t", ZOHO_SMTP_USER: "u@b.com", ZOHO_SMTP_PASSWORD: "p", EMAIL_FROM: "a@b.com", EMAIL_PROVIDER: "zoho" } as any)).toBe("zoho");
    expect(emailProvider({} as any)).toBeNull();
    expect(emailProvider({ ZEPTOMAIL_TOKEN: "t" } as any)).toBeNull(); // no sender address
  });
  describe("sending", () => {
    const old = { ...process.env };
    afterEach(() => { process.env = { ...old }; vi.unstubAllGlobals(); });
    it("zeptomail: posts the documented JSON with the Zoho-enczapikey header", async () => {
      process.env.ZEPTOMAIL_TOKEN = "abc123"; process.env.EMAIL_FROM = "noreply@x.com"; delete process.env.ZOHO_SMTP_USER;
      const f = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => "" }); vi.stubGlobal("fetch", f);
      await sendEmail({ to: "a@b.com", toName: "Amaya", subject: "S", text: "T", html: "<p>H</p>" });
      const [url, init] = f.mock.calls[0] as [string, any];
      expect(url).toBe("https://api.zeptomail.com/v1.1/email");
      expect(init.headers.Authorization).toBe("Zoho-enczapikey abc123");
      expect(JSON.parse(init.body)).toMatchObject({ from: { address: "noreply@x.com" }, to: [{ email_address: { address: "a@b.com", name: "Amaya" } }], subject: "S", htmlbody: "<p>H</p>", textbody: "T" });
    });
    it("zeptomail: keeps a token that already has the prefix, and reports failures", async () => {
      process.env.ZEPTOMAIL_TOKEN = "Zoho-enczapikey xyz"; process.env.EMAIL_FROM = "n@x.com"; process.env.ZEPTOMAIL_URL = "https://api.zeptomail.in/";
      const f = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "bad token" }); vi.stubGlobal("fetch", f);
      await expect(sendEmail({ to: "a@b.com", subject: "S", text: "T", html: "H" })).rejects.toThrow(/ZeptoMail 401/);
      expect((f.mock.calls[0] as any)[0]).toBe("https://api.zeptomail.in/v1.1/email");
      expect((f.mock.calls[0] as any)[1].headers.Authorization).toBe("Zoho-enczapikey xyz");
    });
    it("refuses clearly when nothing is configured", async () => {
      for (const k of ["ZEPTOMAIL_TOKEN", "ZOHO_SMTP_USER", "ZOHO_SMTP_PASSWORD", "EMAIL_FROM"]) delete process.env[k];
      await expect(sendEmail({ to: "a@b.com", subject: "S", text: "T", html: "H" })).rejects.toThrow(/not set up/);
    });
  });
});

describe("discord", () => {
  const old = { ...process.env };
  afterEach(() => { process.env = { ...old }; vi.unstubAllGlobals(); });
  it("prefers a direct message when the bot token and the person's id are known", () => {
    expect(discordRoute(true, { DISCORD_BOT_TOKEN: "b", DISCORD_WEBHOOK_URL: "u" } as any)).toBe("dm");
    expect(discordRoute(false, { DISCORD_BOT_TOKEN: "b", DISCORD_WEBHOOK_URL: "u" } as any)).toBe("webhook");
    expect(discordRoute(true, {} as any)).toBeNull();
  });
  it("opens a DM channel then sends the message", async () => {
    process.env.DISCORD_BOT_TOKEN = "bot-token"; delete process.env.DISCORD_WEBHOOK_URL;
    const f = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: "chan1" }), text: async () => "" }).mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" });
    vi.stubGlobal("fetch", f);
    expect((await sendDiscord({ userId: "123456789012345678", content: "hello" })).route).toBe("dm");
    expect(f.mock.calls[0][0]).toBe("https://discord.com/api/v10/users/@me/channels");
    expect((f.mock.calls[0][1] as any).headers.Authorization).toBe("Bot bot-token");
    expect(JSON.parse((f.mock.calls[0][1] as any).body)).toEqual({ recipient_id: "123456789012345678" });
    expect(f.mock.calls[1][0]).toBe("https://discord.com/api/v10/channels/chan1/messages");
    expect(JSON.parse((f.mock.calls[1][1] as any).body).content).toBe("hello");
  });
  it("posts to the webhook and mentions only the named person", async () => {
    delete process.env.DISCORD_BOT_TOKEN; process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1/x";
    const f = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => "" }); vi.stubGlobal("fetch", f);
    await sendDiscord({ userId: "123456789012345678", content: "hi" });
    const body = JSON.parse((f.mock.calls[0][1] as any).body);
    expect(body.content).toBe("<@123456789012345678> hi"); expect(body.allowed_mentions).toEqual({ users: ["123456789012345678"] });
  });
  it("validates Discord ids and refuses when nothing is configured", async () => {
    expect(validDiscordId("123456789012345678")).toBe(true); expect(validDiscordId("amaya#1234")).toBe(false);
    delete process.env.DISCORD_BOT_TOKEN; delete process.env.DISCORD_WEBHOOK_URL;
    await expect(sendDiscord({ userId: "1", content: "x" })).rejects.toThrow(/not set up/);
  });
});
