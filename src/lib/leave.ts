import { db } from "./db";
import { getSetting, setSetting } from "./settings";
import { getWorkspace } from "./config";
import { runAs } from "./context";
import { googleFetch } from "./integrations/google";
import { availability, type Availability, type Holiday, type LeaveLite } from "./capacity";
import { localDate } from "./time";

export const getHolidays = async (): Promise<Holiday[]> => ((await getSetting<Holiday[]>("holidays")) ?? []).sort((a, b) => a.date.localeCompare(b.date));
export const saveHolidays = (list: Holiday[]) => setSetting("holidays", list);

/** Approved leave overlapping [start, end]. */
export async function approvedLeave(start: string, end: string): Promise<LeaveLite[]> {
  const rows = await db.leave.findMany({ where: { status: "APPROVED", startDate: { lte: end }, endDate: { gte: start } } });
  return rows.map((l) => ({ developerId: l.developerId, start: l.startDate, end: l.endDate, portion: l.portion as "FULL" | "HALF" }));
}

export const sprintDates = (s: { startDate: Date; endDate: Date }) => ({ start: localDate(s.startDate), end: localDate(s.endDate) });

export interface TeamAvailability {
  start: string; end: string; holidays: Holiday[]; leaves: LeaveLite[];
  perDev: { id: string; name: string; capacityHrs: number; av: Availability }[];
  hours: number; fullHours: number; lostHours: number; leaveDays: number;
}

/** Leave- and holiday-aware capacity of the given developers over [start, end]. */
export async function teamAvailability(devs: { id: string; name: string; capacityHrs: number }[], start: string, end: string): Promise<TeamAvailability> {
  const [holidays, leaves] = await Promise.all([getHolidays(), approvedLeave(start, end)]);
  const perDev = devs.map((d) => ({ id: d.id, name: d.name, capacityHrs: d.capacityHrs, av: availability(d.capacityHrs, start, end, leaves, d.id, holidays) }));
  const sum = (f: (a: Availability) => number) => Math.round(perDev.reduce((a, d) => a + f(d.av), 0) * 10) / 10;
  return { start, end, holidays, leaves, perDev, hours: sum((a) => a.hours), fullHours: sum((a) => a.fullHours), lostHours: sum((a) => a.lostHours), leaveDays: sum((a) => a.leaveDays) };
}

/** Developers who count towards sprint capacity. */
export const capacityDevs = () => db.developer.findMany({ where: { active: true, role: { not: "Engineering Manager" } }, orderBy: { name: "asc" } });

// ---- Google Calendar: optional out-of-office events, created on the requester's own calendar ----
const calId = () => encodeURIComponent(process.env.GOOGLE_CALENDAR_ID || "primary");

/** Best effort: never blocks or fails the approval. Returns the event id when one was created. */
export async function syncLeaveEvent(leaveId: string): Promise<string | null> {
  const l = await db.leave.findUnique({ where: { id: leaveId }, include: { developer: true } });
  if (!l || l.status !== "APPROVED" || l.googleEventId) return l?.googleEventId ?? null;
  const cfg = await getWorkspace();
  const conn = await db.connection.findUnique({ where: { userId_provider: { userId: l.developerId, provider: "GOOGLE" } } });
  if (!conn) return null;
  try {
    const half = l.portion === "HALF";
    const body = {
      summary: `Out of office (${l.type.toLowerCase()})`, eventType: "outOfOffice", transparency: "opaque",
      outOfOfficeProperties: { autoDeclineMode: "declineNone", declineMessage: "I'm on leave." },
      start: { dateTime: `${l.startDate}T${cfg.workStart}:00`, timeZone: cfg.timezone },
      end: { dateTime: `${l.endDate}T${half ? "13:00" : cfg.workEnd}:00`, timeZone: cfg.timezone },
    };
    const id = await runAs(l.developerId, async () => (await googleFetch<{ id: string }>(`https://www.googleapis.com/calendar/v3/calendars/${calId()}/events`, { method: "POST", body: JSON.stringify(body) })).id);
    await db.leave.update({ where: { id: leaveId }, data: { googleEventId: id } });
    return id;
  } catch { return null; }
}

export async function removeLeaveEvent(l: { id: string; developerId: string; googleEventId: string | null }) {
  if (!l.googleEventId) return;
  try { await runAs(l.developerId, () => googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${calId()}/events/${l.googleEventId}`, { method: "DELETE" })); } catch { /* already gone or not connected */ }
  await db.leave.update({ where: { id: l.id }, data: { googleEventId: null } });
}
