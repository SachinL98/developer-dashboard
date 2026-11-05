import { describe, expect, it } from "vitest";
import { pickMeetings, MAX_TRIES, type AutoCandidate } from "../src/lib/meet-auto";

const now = new Date("2026-11-05T12:00:00Z");
const m = (id: string, minutesAgo: number, over: Partial<AutoCandidate> = {}): AutoCandidate => ({ id, endsAt: new Date(now.getTime() - minutesAgo * 60_000), transcript: null, summary: null, meetUrl: "https://meet.google.com/abc-defg-hij", ...over });

describe("pickMeetings", () => {
  it("waits for Meet to publish the transcript, and ignores old meetings", () => {
    expect(pickMeetings([m("fresh", 2), m("ok", 10), m("old", 4 * 24 * 60)], {}, now).map((x) => x.id)).toEqual(["ok"]);
  });
  it("skips meetings that already have notes or have no Meet link", () => {
    expect(pickMeetings([m("a", 30, { summary: "done" }), m("b", 30, { transcript: "x" }), m("c", 30, { meetUrl: null }), m("d", 30)], {}, now).map((x) => x.id)).toEqual(["d"]);
  });
  it("retries politely and gives up eventually", () => {
    const state = { recent: { tries: 1, lastTry: new Date(now.getTime() - 5 * 60_000).toISOString() }, later: { tries: 2, lastTry: new Date(now.getTime() - 20 * 60_000).toISOString() }, spent: { tries: MAX_TRIES, lastTry: null } };
    expect(pickMeetings([m("recent", 30), m("later", 60), m("spent", 90)], state, now).map((x) => x.id)).toEqual(["later"]);
  });
  it("takes the newest first and respects the limit", () => {
    expect(pickMeetings([m("a", 100), m("b", 20), m("c", 50)], {}, now, 2).map((x) => x.id)).toEqual(["b", "c"]);
  });
});
