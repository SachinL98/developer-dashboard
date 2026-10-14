export const TZ = process.env.TEAM_TIMEZONE || "Asia/Colombo";

/** Offset (ms) of `tz` from UTC at the given instant. */
function tzOffset(tz: string, at: Date): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
  });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - at.getTime();
}

/** Wall-clock time in `tz` → UTC Date. */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz = TZ): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = tzOffset(tz, new Date(guess));
  return new Date(guess - off);
}

/** Y/M/D/weekday (0=Sun) of an instant as seen in `tz`. */
export function zonedParts(at: Date, tz = TZ) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { y: +p.year, m: +p.month, d: +p.day, wd };
}

export const fmtDur = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
};
export const hours = (ms: number) => ms / 3_600_000;
export const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
export const fmtDay = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
