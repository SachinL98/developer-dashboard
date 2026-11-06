import { db } from "../db";
import { getWorkspace } from "../config";
import { getSetting, setSetting } from "../settings";
import { approvedLeave, getHolidays } from "../leave";
import { isWorkday, leaveFractions } from "../capacity";
import { localDate, zonedToUtc } from "../time";
import { isPlaceholderEmail } from "../jira-people";
import { emailProvider, renderEmail, sendEmail } from "./email";
import { discordRoute, sendDiscord } from "./discord";
import { failingMinutes, ALERT_AFTER_MIN, type SyncHealth } from "../sync-health";
import { notifyInbox } from "../inbox";
import { minutesOfDay, overdueMessage, overdueTickets, shouldRemindStart, shouldSendOverdue, startReminderMessage } from "./rules";

export interface NotifyConfig { overdue: boolean; startReminder: boolean; graceMin: number }
export const defaultNotifyConfig: NotifyConfig = { overdue: true, startReminder: true, graceMin: 30 };
export const getNotifyConfig = async (): Promise<NotifyConfig> => ({ ...defaultNotifyConfig, ...((await getSetting<Partial<NotifyConfig>>("notify.config")) ?? {}) });
export const saveNotifyConfig = (c: NotifyConfig) => setSetting("notify.config", c);

interface Msg { subject: string; intro: string; items?: string[]; url: string; discord: string }
type Person = { id: string; name: string; email: string; discordId: string | null; notifyEmail: boolean; notifyDiscord: boolean };

const base = () => (process.env.APP_URL || "").replace(/\/$/, "");

/** Send one message on every channel the person has on and the platform has set up. Returns what happened on each. */
export async function sendToPerson(p: Person, m: Msg): Promise<{ status: "sent" | "failed" | "skipped"; channels: Record<string, string> }> {
  const channels: Record<string, string> = {};
  if (!p.notifyEmail) channels.email = "off";
  else if (!emailProvider()) channels.email = "not set up";
  else if (isPlaceholderEmail(p.email)) channels.email = "no real email";
  else {
    try { const mail = renderEmail({ title: m.subject, intro: m.intro, items: m.items, button: { label: "Open the dashboard", url: m.url } }); const r = await sendEmail({ to: p.email, toName: p.name, subject: m.subject, ...mail }); channels.email = `sent (${r.provider})`; }
    catch (e) { channels.email = `failed: ${e instanceof Error ? e.message.slice(0, 120) : e}`; }
  }
  if (!p.notifyDiscord) channels.discord = "off";
  else if (!discordRoute(!!p.discordId)) channels.discord = "not set up";
  else {
    try { const r = await sendDiscord({ userId: p.discordId, content: m.discord }); channels.discord = `sent (${r.route})`; }
    catch (e) { channels.discord = `failed: ${e instanceof Error ? e.message.slice(0, 120) : e}`; }
  }
  const vals = Object.values(channels);
  return { status: vals.some((v) => v.startsWith("sent")) ? "sent" : vals.some((v) => v.startsWith("failed")) ? "failed" : "skipped", channels };
}

/** At most one message of a kind per person per day. A failed attempt is retried after 20 minutes. */
async function deliverOnce(p: Person, kind: string, dayKey: string, m: Msg, now: Date) {
  const prev = await db.notificationLog.findUnique({ where: { userId_kind_dayKey: { userId: p.id, kind, dayKey } } });
  if (prev && (prev.status !== "failed" || now.getTime() - prev.createdAt.getTime() < 20 * 60_000)) return null;
  const r = await sendToPerson(p, m);
  const data = { status: r.status, channels: r.channels as any, summary: m.subject, createdAt: now };
  await db.notificationLog.upsert({ where: { userId_kind_dayKey: { userId: p.id, kind, dayKey } }, update: data, create: { userId: p.id, kind, dayKey, ...data } });
  return r;
}

export async function runNotifications(now = new Date(), opts: { force?: boolean } = {}) {
  const last = await getSetting<string>("notify.lastRun");
  if (!opts.force && last && now.getTime() - new Date(last).getTime() < 2 * 60_000) return { ran: false, reminders: 0, overdue: 0, note: "throttled" };
  await setSetting("notify.lastRun", now.toISOString());
  const [cfg, ws, holidays] = await Promise.all([getNotifyConfig(), getWorkspace(), getHolidays()]);
  const tz = ws.timezone, today = localDate(now, tz);
  const hol = new Set(holidays.map((h) => h.date));
  const workingDay = isWorkday(today) && !hol.has(today);
  if (!workingDay) return { ran: true, reminders: 0, overdue: 0, note: "not a working day" };
  const nowMin = minutesOfDay(now, tz);

  const people = (await db.developer.findMany({ where: { active: true, passwordHash: { not: null } }, select: { id: true, name: true, email: true, discordId: true, notifyEmail: true, notifyDiscord: true } })).filter((p) => !isPlaceholderEmail(p.email));
  if (!people.length) return { ran: true, reminders: 0, overdue: 0 };
  const ids = people.map((p) => p.id);
  const [y, m, d] = today.split("-").map(Number);
  const dayStart = zonedToUtc(y, m, d, 0, 0, tz);
  const [leaves, sessions, entries, tickets, sprints] = await Promise.all([
    approvedLeave(today, today),
    db.workSession.findMany({ where: { developerId: { in: ids }, startedAt: { gte: dayStart } }, select: { developerId: true } }),
    db.timeEntry.findMany({ where: { developerId: { in: ids }, startedAt: { gte: dayStart } }, select: { developerId: true } }),
    cfg.overdue ? db.ticket.findMany({ where: { assigneeId: { in: ids } }, select: { id: true, key: true, title: true, status: true, assigneeId: true, dueDate: true, sprintId: true } }) : Promise.resolve([]),
    cfg.overdue ? db.sprint.findMany({ select: { id: true, name: true, state: true, endDate: true } }) : Promise.resolve([]),
  ]);
  const started = new Set([...sessions, ...entries].map((x) => x.developerId));

  let reminders = 0, overdue = 0, budget = 60;
  for (const p of people) {
    if (budget <= 0) break;
    const away = leaveFractions(leaves, p.id, hol).get(today) ?? 0;
    if (cfg.startReminder && shouldRemindStart({ nowMin, workStart: ws.workStart, workEnd: ws.workEnd, graceMin: cfg.graceMin, startedToday: started.has(p.id), awayFraction: away, workingDay })) {
      const r = await deliverOnce(p, "START_REMINDER", today, startReminderMessage(p.name, ws.workStart, cfg.graceMin, base()), now);
      if (r) { reminders++; budget--; }
    }
    if (cfg.overdue) {
      const list = overdueTickets(tickets.filter((t) => t.assigneeId === p.id), sprints, today, tz);
      if (shouldSendOverdue({ nowMin, workStart: ws.workStart, workEnd: ws.workEnd, awayFraction: away, workingDay, count: list.length })) {
        const r = await deliverOnce(p, "OVERDUE", today, overdueMessage(p.name, list, base()), now);
        if (r) { overdue++; budget--; }
      }
    }
  }
  await alertSyncHealth(now, today);
  return { ran: true, reminders, overdue };
}

/** Tell admins (inbox, email, Discord) once a day when the automatic Jira sync has been failing for over an hour. */
async function alertSyncHealth(now: Date, today: string) {
  const health = await getSetting<SyncHealth>("jira.health");
  const mins = failingMinutes(health, now);
  if (mins < ALERT_AFTER_MIN) return;
  const admins = await db.developer.findMany({ where: { active: true, access: "ADMIN", passwordHash: { not: null } }, select: { id: true, name: true, email: true, discordId: true, notifyEmail: true, notifyDiscord: true } });
  const why = health?.lastError ?? "unknown error";
  for (const a of admins) {
    const r = await deliverOnce(a, "SYNC_FAILING", today, {
      subject: "Jira sync has been failing", intro: `Hi ${a.name.split(" ")[0]}, the automatic Jira sync has failed for about ${Math.round(mins / 60)} hour(s), so tickets and sprints may be out of date. Last error: ${why}`,
      items: ["Open Settings and check the Jira connection, then press Sync Jira."], url: `${base()}/settings`, discord: `Jira sync has been failing for ~${Math.round(mins / 60)}h. Last error: ${why}. ${base()}/settings`,
    }, now);
    if (r) await notifyInbox(a.id, { kind: "SYNC", title: "Jira sync has been failing", body: why.slice(0, 160), href: "/settings" });
  }
}

/** A test message to one person, so an admin can check email and Discord are working. Not limited to once a day. */
export async function sendTest(p: Person) {
  const r = await sendToPerson(p, { subject: "Test notification from Dev Dashboard", intro: `Hi ${p.name.split(" ")[0]}, this is a test. If you can read it, alerts for overdue tickets and start-of-day reminders will reach you here.`, url: `${base()}/settings`, discord: `✅ Hi ${p.name.split(" ")[0]}, this is a test message from SpaceIT Delivery.` });
  await db.notificationLog.create({ data: { userId: p.id, kind: "TEST", dayKey: `${localDate(new Date())}-${Date.now()}`, status: r.status, channels: r.channels as any, summary: "Test" } });
  return r;
}
