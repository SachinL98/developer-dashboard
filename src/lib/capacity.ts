// Leave-aware capacity and finish forecasts. Pure (no DB). Dates are local calendar dates as "YYYY-MM-DD".
export const LEAVE_TYPES = [
  { id: "ANNUAL", label: "Annual leave" }, { id: "CASUAL", label: "Casual leave" }, { id: "SICK", label: "Sick leave" },
  { id: "UNPAID", label: "Unpaid leave" }, { id: "OTHER", label: "Other" },
] as const;
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export interface LeaveLite { developerId: string; start: string; end: string; portion: "FULL" | "HALF" }
export interface Holiday { date: string; name: string }

const DAY = 86_400_000;
const ms = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
export const dateStr = (t: number) => new Date(t).toISOString().slice(0, 10);
export const isDateStr = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && dateStr(ms(s)) === s;
export const addDays = (s: string, n: number) => dateStr(ms(s) + n * DAY);
export const weekday = (s: string) => new Date(ms(s)).getUTCDay(); // 0 = Sunday
export const isWorkday = (s: string) => { const w = weekday(s); return w >= 1 && w <= 5; };
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = ms(start); t <= ms(end) && out.length < 800; t += DAY) out.push(dateStr(t));
  return out;
}

/** How much of each date a developer is away (0 to 1), counting only working days that are not public holidays. */
export function leaveFractions(leaves: LeaveLite[], developerId: string, holidays: Set<string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of leaves) {
    if (l.developerId !== developerId) continue;
    for (const d of eachDay(l.start, l.end)) {
      if (!isWorkday(d) || holidays.has(d)) continue;
      out.set(d, Math.min(1, (out.get(d) ?? 0) + (l.portion === "HALF" ? 0.5 : 1)));
    }
  }
  return out;
}

export interface Availability { workdays: number; holidayDays: number; leaveDays: number; availableDays: number; hours: number; fullHours: number; lostHours: number }

/** Hours a developer can work in [start, end]. `capacityHrsPerWeek` is spread over five working days. */
export function availability(capacityHrsPerWeek: number, start: string, end: string, leaves: LeaveLite[], developerId: string, holidays: Holiday[]): Availability {
  const hol = new Set(holidays.map((h) => h.date));
  const away = leaveFractions(leaves, developerId, hol);
  const days = eachDay(start, end).filter(isWorkday);
  const holidayDays = days.filter((d) => hol.has(d)).length;
  const leaveDays = [...away.entries()].filter(([d]) => d >= start && d <= end).reduce((a, [, f]) => a + f, 0);
  const availableDays = days.length - holidayDays - leaveDays;
  const perDay = capacityHrsPerWeek / 5;
  const r = (n: number) => Math.round(n * 10) / 10;
  return { workdays: days.length, holidayDays, leaveDays, availableDays, hours: r(perDay * availableDays), fullHours: r(perDay * days.length), lostHours: r(perDay * (days.length - availableDays)) };
}

/** First date on which `remainingHrs` of work is finished, working `perDayHrs` on available days from `from`. Null if never (within ~2 years). */
export function forecastFinish(from: string, remainingHrs: number, perDayHrs: number, leaves: LeaveLite[], developerId: string, holidays: Holiday[]): string | null {
  if (remainingHrs <= 0) return from;
  if (perDayHrs <= 0) return null;
  const hol = new Set(holidays.map((h) => h.date));
  const away = leaveFractions(leaves, developerId, hol);
  let left = remainingHrs;
  for (let i = 0; i < 730; i++) {
    const d = addDays(from, i);
    if (!isWorkday(d) || hol.has(d)) continue;
    left -= perDayHrs * (1 - (away.get(d) ?? 0));
    if (left <= 1e-9) return d;
  }
  return null;
}

/** Working days a request covers, for display (half day = 0.5), ignoring weekends and the given holidays. */
export function requestDays(start: string, end: string, portion: "FULL" | "HALF", holidays: Holiday[]): number {
  const hol = new Set(holidays.map((h) => h.date));
  const n = eachDay(start, end).filter((d) => isWorkday(d) && !hol.has(d)).length;
  return portion === "HALF" ? Math.min(n, 1) * 0.5 : n;
}

export const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start <= b.end && b.start <= a.end;

export interface LeaveInput { type: string; start: string; end: string; portion: "FULL" | "HALF"; reason: string }

/** Validate a leave request. Returns an error message, or null when it is fine. */
export function checkRequest(i: LeaveInput, mine: { start: string; end: string; status: string }[], holidays: Holiday[], today: string): string | null {
  if (!isDateStr(i.start) || !isDateStr(i.end)) return "Pick valid dates.";
  if (i.end < i.start) return "The end date is before the start date.";
  if (i.start < addDays(today, -30)) return "Leave can only be registered up to 30 days back.";
  if (i.end > addDays(i.start, 90)) return "A single request can cover at most 90 days. Split it into two.";
  if (i.portion === "HALF" && i.start !== i.end) return "A half day must be a single date.";
  if (requestDays(i.start, i.end, i.portion, holidays) === 0) return "That range has no working days (weekends and public holidays don't need leave).";
  if (mine.some((m) => (m.status === "PENDING" || m.status === "APPROVED") && overlaps(m, i))) return "You already have leave that overlaps these dates.";
  return null;
}

export interface ForecastRow { ticketId: string; finish: string | null; late: boolean; leaveInSprint: number }

/**
 * Per assignee, work through their open cards in priority order and forecast each finish date given their leave and
 * public holidays. A card is "late" when the forecast passes the sprint end.
 */
export function forecastCards(
  tickets: { id: string; assigneeId: string | null; remainingHrs: number }[], devs: { id: string; capacityHrs: number }[], from: string, sprintEnd: string, leaves: LeaveLite[], holidays: Holiday[],
): ForecastRow[] {
  const out: ForecastRow[] = [];
  for (const d of devs) {
    const own = tickets.filter((t) => t.assigneeId === d.id);
    const perDay = d.capacityHrs / 5;
    let cum = 0;
    const leaveInSprint = availability(d.capacityHrs, from, sprintEnd, leaves, d.id, holidays).leaveDays;
    for (const t of own) {
      cum += t.remainingHrs;
      const finish = forecastFinish(from, cum, perDay, leaves, d.id, holidays);
      out.push({ ticketId: t.id, finish, late: finish == null || finish > sprintEnd, leaveInSprint });
    }
  }
  return out;
}

