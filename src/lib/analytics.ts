import { DONE_STATES } from "./workflow";

export interface TransitionRow { ticketId: string; from: string; to: string; at: Date }
const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(Math.floor(d.getTime() / DAY) * DAY);

/** Average hours tickets sit in each column (time between entering and leaving). */
export function columnDwell(transitions: TransitionRow[], createdAt: Record<string, Date>, now = new Date()) {
  const by: Record<string, TransitionRow[]> = {};
  for (const t of transitions) (by[t.ticketId] ||= []).push(t);
  const sums: Record<string, { total: number; n: number }> = {};
  for (const [id, ts] of Object.entries(by)) {
    ts.sort((a, b) => a.at.getTime() - b.at.getTime());
    let enteredAt = createdAt[id] ?? ts[0].at;
    let col = ts[0].from;
    for (const t of ts) {
      (sums[col] ||= { total: 0, n: 0 });
      sums[col].total += t.at.getTime() - enteredAt.getTime(); sums[col].n++;
      enteredAt = t.at; col = t.to;
    }
    void now;
  }
  return Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v.total / v.n / 3_600_000]));
}

export interface BurnTicket { points: number; hours: number; doneAt: Date | null }
/** Burndown in points and hours: ideal vs actual remaining, one row per day. */
export function burndown(start: Date, end: Date, tickets: BurnTicket[], now = new Date()) {
  const s = startOfDay(start), e = startOfDay(end);
  const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / DAY));
  const totalPts = tickets.reduce((a, t) => a + t.points, 0);
  const totalHrs = tickets.reduce((a, t) => a + t.hours, 0);
  const rows = [];
  for (let i = 0; i <= days; i++) {
    const day = new Date(s.getTime() + i * DAY);
    const endOfDay = day.getTime() + DAY;
    const future = day.getTime() > now.getTime();
    const donePts = tickets.filter((t) => t.doneAt && t.doneAt.getTime() < endOfDay).reduce((a, t) => a + t.points, 0);
    const doneHrs = tickets.filter((t) => t.doneAt && t.doneAt.getTime() < endOfDay).reduce((a, t) => a + t.hours, 0);
    rows.push({
      day: day.toISOString().slice(0, 10),
      idealPts: Math.round((totalPts * (1 - i / days)) * 10) / 10,
      idealHrs: Math.round((totalHrs * (1 - i / days)) * 10) / 10,
      actualPts: future ? null : totalPts - donePts,
      actualHrs: future ? null : totalHrs - doneHrs,
    });
  }
  return rows;
}

export interface CycleTicket { startedAt: Date | null; doneAt: Date | null }
export const avgCycleDays = (ts: CycleTicket[]) => {
  const xs = ts.filter((t) => t.startedAt && t.doneAt).map((t) => (t.doneAt!.getTime() - t.startedAt!.getTime()) / DAY);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
};

/** Estimate accuracy: actual / estimate (1.0 = perfect, >1 under-estimated). */
export const accuracy = (estimateHrs: number | null, actualHrs: number) =>
  estimateHrs && actualHrs ? actualHrs / estimateHrs : null;

export const isDone = (status: string) => (DONE_STATES as string[]).includes(status);

export const sumEntries = (entries: { startedAt: Date; endedAt: Date | null }[], now = new Date()) =>
  entries.reduce((a, e) => a + ((e.endedAt ?? now).getTime() - e.startedAt.getTime()), 0);

/** Bucket entries into per-day hours (UTC day keys). */
export function hoursPerDay(entries: { startedAt: Date; endedAt: Date | null }[], now = new Date()) {
  const out: Record<string, number> = {};
  for (const e of entries) {
    const key = e.startedAt.toISOString().slice(0, 10);
    out[key] = (out[key] ?? 0) + ((e.endedAt ?? now).getTime() - e.startedAt.getTime()) / 3_600_000;
  }
  return out;
}
