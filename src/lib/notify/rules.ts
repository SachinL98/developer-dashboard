// When to notify and what to say. Pure (no database, no network), so every rule is unit tested.
import { DONE_STATES } from "../workflow";

export interface TicketLite { id: string; key: string; title: string; status: string; assigneeId: string | null; dueDate: Date | null; sprintId: string | null }
export interface SprintLite { id: string; name: string; state: string; endDate: Date }
export interface Overdue { key: string; title: string; id: string; reason: "due" | "sprint"; daysOverdue: number; since: string }

const DAY = 86_400_000;
const ymd = (d: Date, tz: string) => d.toLocaleDateString("en-CA", { timeZone: tz });
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/**
 * A ticket is overdue when it is not done and either its due date has passed, or its sprint has ended (and the sprint was started).
 * `today` is the local date. Most overdue first.
 */
export function overdueTickets(tickets: TicketLite[], sprints: SprintLite[], today: string, tz: string): Overdue[] {
  const byId = new Map(sprints.map((s) => [s.id, s]));
  const out: Overdue[] = [];
  for (const t of tickets) {
    if ((DONE_STATES as string[]).includes(t.status)) continue;
    if (t.dueDate) {
      const due = ymd(t.dueDate, tz), n = days(due, today);
      if (n >= 1) { out.push({ key: t.key, title: t.title, id: t.id, reason: "due", daysOverdue: n, since: due }); continue; }
    }
    const sp = t.sprintId ? byId.get(t.sprintId) : undefined;
    if (sp && sp.state !== "PLANNING" && t.status !== "BACKLOG") {
      const end = ymd(sp.endDate, tz), n = days(end, today);
      if (n >= 1) out.push({ key: t.key, title: t.title, id: t.id, reason: "sprint", daysOverdue: n, since: end });
    }
  }
  return out.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export const parseHHMM = (s: string) => { const [h, m] = s.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export const minutesOfDay = (d: Date, tz: string) => { const [h, m] = d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number); return h * 60 + m; };

/**
 * Remind someone to start their day: it is a working day, they are not on leave, the work day began at least `graceMin` minutes ago
 * (and has not ended), and nothing has been started today (no work session, no timer).
 */
export function shouldRemindStart(o: { nowMin: number; workStart: string; workEnd: string; graceMin: number; startedToday: boolean; awayFraction: number; workingDay: boolean }): boolean {
  if (!o.workingDay || o.awayFraction >= 1 || o.startedToday) return false;
  const from = parseHHMM(o.workStart) + o.graceMin;
  return o.nowMin >= from && o.nowMin < parseHHMM(o.workEnd);
}

/** Overdue digest goes out once the work day has begun, on working days, to people who are not on leave. */
export function shouldSendOverdue(o: { nowMin: number; workStart: string; workEnd: string; awayFraction: number; workingDay: boolean; count: number }): boolean {
  return o.workingDay && o.awayFraction < 1 && o.count > 0 && o.nowMin >= parseHHMM(o.workStart) && o.nowMin < parseHHMM(o.workEnd);
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
export function overdueMessage(name: string, list: Overdue[], baseUrl: string) {
  const first = name.split(" ")[0];
  const top = list.slice(0, 10);
  const lines = top.map((o) => `${o.key} ${o.title.slice(0, 80)}: ${plural(o.daysOverdue, "day")} overdue${o.reason === "sprint" ? " (sprint ended)" : ""}`);
  if (list.length > top.length) lines.push(`…and ${list.length - top.length} more`);
  return {
    subject: `You have ${plural(list.length, "overdue ticket")}`,
    intro: `Hi ${first}, ${list.length === 1 ? "this ticket is" : "these tickets are"} past ${list.length === 1 ? "its" : "their"} due date or sprint end and not done yet. Please finish ${list.length === 1 ? "it" : "them"}, or talk to your lead if the date needs to change.`,
    items: lines, url: `${baseUrl}/board`,
    discord: `**${plural(list.length, "overdue ticket")}** for ${first}\n${lines.map((l) => `• ${l}`).join("\n")}\n${baseUrl}/board`,
  };
}
export function startReminderMessage(name: string, workStart: string, graceMin: number, baseUrl: string) {
  const first = name.split(" ")[0];
  return {
    subject: "Please start your work day timer",
    intro: `Hi ${first}, your work day started at ${workStart} and nothing is running yet, ${graceMin} minutes later. If you are working, press Start day (or start a ticket timer) so your hours are tracked. If you are off today, ask your lead to mark it as leave.`,
    url: `${baseUrl}/time`,
    discord: `⏰ Hi ${first}, your work day started at ${workStart} and no timer is on yet. Press **Start day** or start a ticket timer: ${baseUrl}/time`,
  };
}
