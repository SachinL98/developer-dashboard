import { request, IntegrationError } from "./http";
import { TZ } from "../time";

export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);

let cached: { token: string; exp: number } | null = null;
async function accessToken() {
  if (!googleConfigured()) throw new IntegrationError("Google", "not configured (set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)");
  if (cached && cached.exp > Date.now() + 30_000) return cached.token;
  const res = await request<{ access_token: string; expires_in: number }>("Google", "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: process.env.GOOGLE_REFRESH_TOKEN!, grant_type: "refresh_token" }),
  });
  cached = { token: res.access_token, exp: Date.now() + res.expires_in * 1000 };
  return cached.token;
}

const cal = process.env.GOOGLE_CALENDAR_ID || "primary";
const api = async <T>(path: string, init: RequestInit = {}) =>
  request<T>("Google", `https://www.googleapis.com/calendar/v3${path}`, {
    ...init, headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

export interface CalEvent { id: string; summary: string; start: string; end: string; meetUrl?: string; attendees: string[]; recurringId?: string }

export async function listEvents(from: Date, to: Date): Promise<CalEvent[]> {
  const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" });
  const data = await api<{ items: any[] }>(`/calendars/${encodeURIComponent(cal)}/events?${q}`);
  return (data.items ?? []).filter((e) => e.start?.dateTime).map((e) => ({
    id: e.id, summary: e.summary ?? "(no title)", start: e.start.dateTime, end: e.end.dateTime,
    meetUrl: e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === "video")?.uri,
    attendees: (e.attendees ?? []).map((a: any) => a.email), recurringId: e.recurringEventId,
  }));
}

/** Create an event with an auto-generated Google Meet link. */
export async function createMeetEvent(p: { title: string; start: Date; end: Date; attendees?: string[]; description?: string; rrule?: string }) {
  const body: any = {
    summary: p.title, description: p.description,
    start: { dateTime: p.start.toISOString(), timeZone: TZ }, end: { dateTime: p.end.toISOString(), timeZone: TZ },
    attendees: (p.attendees ?? []).map((email) => ({ email })),
    conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
  };
  if (p.rrule) body.recurrence = [p.rrule];
  const e = await api<any>(`/calendars/${encodeURIComponent(cal)}/events?conferenceDataVersion=1&sendUpdates=all`, { method: "POST", body: JSON.stringify(body) });
  return { id: e.id as string, meetUrl: (e.hangoutLink ?? e.conferenceData?.entryPoints?.[0]?.uri) as string | undefined };
}

/** RRULE for each team meeting so the whole cadence can be created as recurring Meet events. */
export const rruleFor = (days: number[]) => `RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][d]).join(",")}`;
