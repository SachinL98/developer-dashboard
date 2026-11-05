import { zonedParts } from "./time";

/** Jira is pulled automatically on working days between these local times (Sri Lanka time by default). */
export const SYNC_WINDOW = { start: "08:30", end: "17:30", everyMin: 5 } as const;

const mins = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/** True on Monday to Friday from the window start up to and including the window end, in the team timezone. */
export function inSyncWindow(now: Date, tz: string, win: { start: string; end: string } = SYNC_WINDOW): boolean {
  const { wd } = zonedParts(now, tz);
  if (wd === 0 || wd === 6) return false;
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "numeric", minute: "numeric" });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  const t = +p.hour * 60 + +p.minute;
  return t >= mins(win.start) && t <= mins(win.end);
}

/** Due when the last full sync is older than the interval (a little slack so a 5-minute schedule is never skipped by a few seconds). */
export function syncDue(lastSyncIso: string | null | undefined, now: Date, everyMin: number = SYNC_WINDOW.everyMin): boolean {
  if (!lastSyncIso) return true;
  return now.getTime() - new Date(lastSyncIso).getTime() >= (everyMin * 60_000) - 30_000;
}
