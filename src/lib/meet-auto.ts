// Which ended meetings should be checked for a Meet transcript right now. Pure, so the retry rules are unit tested.
export interface AutoCandidate { id: string; endsAt: Date; transcript: string | null; summary: string | null; meetUrl: string | null }
export interface AutoState { tries: number; lastTry: string | null }

export const MIN_WAIT_MIN = 6; // Meet needs a few minutes after the call to publish its transcript
export const MAX_AGE_DAYS = 3;
export const RETRY_EVERY_MIN = 15;
export const MAX_TRIES = 8;

export function pickMeetings(meetings: AutoCandidate[], state: Record<string, AutoState | undefined>, now = new Date(), limit = 5): AutoCandidate[] {
  return meetings
    .filter((m) => m.meetUrl && !m.transcript && !m.summary)
    .filter((m) => now.getTime() - m.endsAt.getTime() >= MIN_WAIT_MIN * 60_000 && now.getTime() - m.endsAt.getTime() <= MAX_AGE_DAYS * 864e5)
    .filter((m) => { const s = state[m.id]; return !s || (s.tries < MAX_TRIES && (!s.lastTry || now.getTime() - new Date(s.lastTry).getTime() >= RETRY_EVERY_MIN * 60_000)); })
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())
    .slice(0, limit);
}
