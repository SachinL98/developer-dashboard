// Leave- and holiday-aware sprint pace. Pure (no DB). Dates are local calendar dates "YYYY-MM-DD".
import { eachDay, isWorkday, leaveFractions, type Holiday, type LeaveLite } from "./capacity";

export interface PaceDev { id: string; capacityHrs: number }
export interface PaceInput { start: string; end: string; today: string; dayFrac: number; devs: PaceDev[]; leaves: LeaveLite[]; holidays: Holiday[] }
export interface DevPace {
  expectedPct: number; // share of THIS developer's available sprint time already gone
  availableDays: number; leaveDays: number; leaveDaysLeft: number; holidayDays: number;
  awayToday: number; // 0 = working, 0.5 = half day, 1 = away
}
export interface PaceModel {
  dates: string[];
  idealRemaining: number[]; // fraction of work still left at the END of each date if the team burns evenly across available time
  elapsedPct: number; // share of the team's available sprint time already gone
  workdaysLeft: number; // working days (not weekends or public holidays) from today to the end, today included
  holidaysToday: boolean;
  perDev: Record<string, DevPace>;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function paceModel(i: PaceInput): PaceModel {
  const dates = eachDay(i.start, i.end);
  const hol = new Set(i.holidays.map((h) => h.date));
  const away = new Map(i.devs.map((d) => [d.id, leaveFractions(i.leaves, d.id, hol)]));
  const workable = (d: string) => isWorkday(d) && !hol.has(d);
  const devHrs = (dev: PaceDev, d: string) => (workable(d) ? (dev.capacityHrs / 5) * (1 - (away.get(dev.id)!.get(d) ?? 0)) : 0);
  const teamHrs = dates.map((d) => i.devs.reduce((a, dev) => a + devHrs(dev, d), 0));
  const total = teamHrs.reduce((a, b) => a + b, 0);

  // Progress through [dates] given the hours on each date, with `frac` of today elapsed.
  const elapsed = (hrs: number[], totalHrs: number, linear: () => number) => {
    if (totalHrs <= 0) return linear();
    let done = 0;
    dates.forEach((d, k) => { if (d < i.today) done += hrs[k]; else if (d === i.today) done += hrs[k] * i.dayFrac; });
    return Math.min(100, Math.max(0, (done / totalHrs) * 100));
  };
  const linear = () => (i.today < i.start ? 0 : i.today > i.end ? 100 : Math.min(100, ((dates.indexOf(i.today) + i.dayFrac) / dates.length) * 100));

  let cum = 0;
  const idealRemaining = dates.map((_, k) => { cum += teamHrs[k]; return total > 0 ? Math.max(0, 1 - cum / total) : Math.max(0, 1 - (k + 1) / dates.length); });

  const perDev: Record<string, DevPace> = {};
  for (const dev of i.devs) {
    const hrs = dates.map((d) => devHrs(dev, d));
    const tot = hrs.reduce((a, b) => a + b, 0);
    const a = away.get(dev.id)!;
    const sprintWork = dates.filter((d) => isWorkday(d));
    perDev[dev.id] = {
      expectedPct: elapsed(hrs, tot, linear),
      availableDays: r1(tot / (dev.capacityHrs / 5 || 1)),
      leaveDays: r1(sprintWork.reduce((s, d) => s + (a.get(d) ?? 0), 0)),
      leaveDaysLeft: r1(sprintWork.filter((d) => d >= i.today).reduce((s, d) => s + (a.get(d) ?? 0), 0)),
      holidayDays: sprintWork.filter((d) => hol.has(d)).length,
      awayToday: workable(i.today) ? a.get(i.today) ?? 0 : 0,
    };
  }
  return {
    dates, idealRemaining, elapsedPct: elapsed(teamHrs, total, linear),
    workdaysLeft: dates.filter((d) => d >= i.today && workable(d)).length, holidaysToday: hol.has(i.today), perDev,
  };
}

/**
 * Working days with no activity since `lastActive` (exclusive) up to `today` (inclusive), skipping weekends, public holidays
 * and days the developer was on full leave. Used so someone on leave is not flagged as idle.
 */
export function idleWorkdays(lastActive: string, today: string, developerId: string, leaves: LeaveLite[], holidays: Holiday[]): number {
  if (today <= lastActive) return 0;
  const hol = new Set(holidays.map((h) => h.date));
  const away = leaveFractions(leaves, developerId, hol);
  return eachDay(lastActive, today).filter((d) => d > lastActive && isWorkday(d) && !hol.has(d) && (away.get(d) ?? 0) < 1).length;
}
