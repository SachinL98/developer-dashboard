import { db } from "./db";
import { MEETING_DEFS, type MeetingDef, type MeetingKindKey } from "./schedule";
import { setTimezone, zonedParts } from "./time";

/**
 * Admin-editable workspace settings, stored in the database. Env vars are only the defaults:
 * a value saved by an admin wins. Secrets (tokens, client secrets) are never stored or shown here.
 */
export interface WorkspaceConfig {
  timezone: string;
  workStart: string; workEnd: string; // "HH:MM" team working hours
  sprintLengthDays: number; sprintStartWeekday: number; // 0=Sun..6=Sat
  defaultCapacityHrs: number; // productive hours per week for new users
  bufferPct: number; // share of capacity kept free when fitting a sprint
  jira: { projectKey: string; boardId: string; storyPointsField: string; sprintField: string };
  github: { org: string };
}

export const defaultWorkspace = (): WorkspaceConfig => ({
  timezone: process.env.TEAM_TIMEZONE || "Asia/Colombo",
  workStart: "09:00", workEnd: "17:30",
  sprintLengthDays: 14, sprintStartWeekday: 1,
  defaultCapacityHrs: 30, bufferPct: 15,
  jira: {
    projectKey: process.env.JIRA_PROJECT_KEY ?? "", boardId: process.env.JIRA_BOARD_ID ?? "",
    storyPointsField: process.env.JIRA_STORY_POINTS_FIELD || "customfield_10016", sprintField: process.env.JIRA_SPRINT_FIELD || "customfield_10020",
  },
  github: { org: process.env.GITHUB_ORG ?? "" },
});

let cache: { at: number; cfg: WorkspaceConfig } | null = null;
const TTL = 10_000;

/** Current config (DB over env defaults), cached for a few seconds. Also applies the timezone. */
export async function getWorkspace(): Promise<WorkspaceConfig> {
  if (cache && Date.now() - cache.at < TTL) return cache.cfg;
  const d = defaultWorkspace();
  const row = await db.appSetting.findUnique({ where: { key: "workspace" } }).catch(() => null);
  const v = (row?.value ?? {}) as Partial<WorkspaceConfig>;
  const pick = <T extends object>(base: T, over?: Partial<T>) => Object.fromEntries(Object.entries(base).map(([k, val]) => [k, (over as any)?.[k] !== undefined && (over as any)[k] !== "" ? (over as any)[k] : val])) as T;
  const cfg: WorkspaceConfig = { ...d, ...Object.fromEntries(Object.entries(v).filter(([k, x]) => k !== "jira" && k !== "github" && x !== undefined && x !== "")), jira: pick(d.jira, v.jira), github: pick(d.github, v.github) } as WorkspaceConfig;
  setTimezone(cfg.timezone);
  cache = { at: Date.now(), cfg };
  return cfg;
}
/** Sync read for code that can't await (uses the last loaded value, else env defaults). */
export const cachedWorkspace = (): WorkspaceConfig => cache?.cfg ?? defaultWorkspace();

export async function saveWorkspace(next: WorkspaceConfig) {
  await db.appSetting.upsert({ where: { key: "workspace" }, update: { value: next as any }, create: { key: "workspace", value: next as any } });
  cache = null;
}

// ---- Meetings ----
export interface MeetingSetting {
  kind: MeetingKindKey; title: string; days: number[]; start: string; end: string; enabled: boolean;
  meetUrl: string; // fixed recurring Google Meet link for this meeting ("" = create one per occurrence via Google)
  blurb: string;
}
export type ResolvedMeetingDef = MeetingDef & { enabled: boolean; meetUrl: string };

const hhmm = (t: [number, number]) => `${String(t[0]).padStart(2, "0")}:${String(t[1]).padStart(2, "0")}`;
export const parseHHMM = (s: string): [number, number] => { const [h, m] = s.split(":").map(Number); return [h, m]; };
export const defaultMeetingSettings = (): MeetingSetting[] =>
  MEETING_DEFS.map((d) => ({ kind: d.kind, title: d.title, days: d.days, start: hhmm(d.start), end: hhmm(d.end), enabled: true, meetUrl: "", blurb: d.blurb }));

export async function getMeetingSettings(): Promise<MeetingSetting[]> {
  const row = await db.appSetting.findUnique({ where: { key: "meetings" } }).catch(() => null);
  const saved = (row?.value ?? []) as unknown as MeetingSetting[];
  return defaultMeetingSettings().map((d) => ({ ...d, ...(saved.find((s) => s.kind === d.kind) ?? {}) }));
}
export async function saveMeetingSettings(list: MeetingSetting[]) {
  await db.appSetting.upsert({ where: { key: "meetings" }, update: { value: list as any }, create: { key: "meetings", value: list as any } });
}

/** The schedule used to generate meetings: our defaults overlaid with the admin's edits. Includes disabled ones (filter `enabled`). */
export async function getMeetingDefs(): Promise<ResolvedMeetingDef[]> {
  await getWorkspace(); // applies the timezone
  const colors = new Map(MEETING_DEFS.map((d) => [d.kind, d.color]));
  return (await getMeetingSettings()).map((s) => ({ kind: s.kind, title: s.title, days: s.days, start: parseHHMM(s.start), end: parseHHMM(s.end), blurb: s.blurb, color: colors.get(s.kind)!, enabled: s.enabled, meetUrl: s.meetUrl }));
}

/** Suggested name and dates for the next sprint from the configured cadence (start weekday and length). */
export function nextSprintDefaults(lastName: string | null, lastEnd: Date | null, cfg: WorkspaceConfig) {
  const base = lastEnd ? new Date(lastEnd.getTime() + 86_400_000) : new Date();
  let p = zonedParts(base);
  let day = Date.UTC(p.y, p.m - 1, p.d);
  for (let i = 0; i < 7 && new Date(day).getUTCDay() !== cfg.sprintStartWeekday; i++) day += 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const n = lastName?.match(/(\d+)\s*$/);
  return { name: n ? lastName!.replace(/\d+\s*$/, String(Number(n[1]) + 1)) : "Sprint 1", start: iso(day), end: iso(day + (cfg.sprintLengthDays - 1) * 86_400_000) };
}
