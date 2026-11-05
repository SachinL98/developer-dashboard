import { describe, expect, it } from "vitest";
import { engagementOf, fmtTalk, matchPerson, parseTranscript, talkStats } from "../src/lib/transcript";

describe("parseTranscript", () => {
  it("reads Meet style 'Name: text' and merges wrapped lines", () => {
    const p = parseTranscript("Amaya Perera: We should ship Friday.\nand test first.\nNuwan Silva: Agreed.");
    expect(p.hasTimes).toBe(false);
    expect(p.segments).toHaveLength(2);
    expect(p.segments[0]).toMatchObject({ speaker: "Amaya Perera", text: "We should ship Friday. and test first." });
  });
  it("reads bracketed and trailing timestamps", () => {
    const p = parseTranscript("[00:00:05] Amaya: Hello team\n[00:00:20] Nuwan: Hi\nDilini (1:05): Morning");
    expect(p.hasTimes).toBe(true);
    expect(p.segments.map((s) => [s.speaker, s.start])).toEqual([["Amaya", 5], ["Nuwan", 20], ["Dilini", 65]]);
    expect(p.durationSec).toBe(65);
  });
  it("reads WebVTT cues with voice tags", () => {
    const p = parseTranscript("WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.500\n<v Amaya Perera>Welcome everyone</v>\n\n2\n00:00:05.000 --> 00:00:07.000\nNuwan Silva: Thanks\n");
    expect(p.segments).toHaveLength(2);
    expect(p.segments[0]).toMatchObject({ speaker: "Amaya Perera", start: 1, end: 4.5 });
    expect(p.segments[1]).toMatchObject({ speaker: "Nuwan Silva", start: 5, end: 7 });
  });
  it("does not treat labels like 'Action:' as speakers", () => {
    const p = parseTranscript("Amaya: Let's go.\nAction: write the doc");
    expect(p.segments.map((s) => s.speaker)).toEqual(["Amaya"]);
  });
});

describe("talkStats", () => {
  it("uses real cue durations when present", () => {
    const s = talkStats(parseTranscript("WEBVTT\n\n00:00:00.000 --> 00:00:10.000\nAmaya: " + "word ".repeat(25) + "\n\n00:00:10.000 --> 00:00:14.000\nNuwan: " + "word ".repeat(10)).segments);
    expect(s[0]).toMatchObject({ name: "Amaya", talkSec: 10, estimated: false });
    expect(s[1]).toMatchObject({ name: "Nuwan", talkSec: 4 });
  });
  it("derives time from gaps between timestamps but never counts long pauses", () => {
    const s = talkStats(parseTranscript("[00:00:00] Amaya: quick note\n[00:10:00] Nuwan: ok").segments);
    expect(s.find((x) => x.name === "Amaya")!.talkSec).toBeLessThan(10);
  });
  it("estimates from word count when there are no timestamps, and says so", () => {
    const s = talkStats(parseTranscript("Amaya: " + "word ".repeat(150) + "\nNuwan: " + "word ".repeat(50)).segments);
    expect(s[0]).toMatchObject({ name: "Amaya", talkSec: 60, words: 150, estimated: true });
    expect(s[1].talkSec).toBe(20);
  });
});

describe("engagementOf", () => {
  const even = [{ name: "A", talkSec: 60, words: 150, turns: 3, estimated: false }, { name: "B", talkSec: 60, words: 150, turns: 3, estimated: false }, { name: "C", talkSec: 60, words: 150, turns: 3, estimated: false }];
  it("scores an even meeting as balanced and a monologue as not", () => {
    expect(engagementOf(even).balance).toBe(1);
    const mono = engagementOf([{ ...even[0], talkSec: 570 }, { ...even[1], talkSec: 15 }, { ...even[2], talkSec: 15 }]);
    expect(mono.balance).toBeLessThan(0.4);
    expect(mono.dominantShare).toBeGreaterThan(90);
  });
  it("lists expected attendees who never spoke", () => {
    expect(engagementOf(even, ["Amaya Perera", "A Smith", "Dilini Fernando"]).silent).toEqual(["Amaya Perera", "Dilini Fernando"]);
  });
  it("handles an empty meeting", () => { expect(engagementOf([])).toMatchObject({ totalTalkSec: 0, speakers: 0, balance: 0 }); });
});

describe("matchPerson and fmtTalk", () => {
  const people = [{ id: "1", name: "Amaya Perera", email: "amaya@x.com" }, { id: "2", name: "Nuwan Silva", email: "nuwan.s@x.com" }, { id: "3", name: "Nuwan Fernando", email: "nf@x.com" }];
  it("matches full names, unique first names and email names, but not ambiguous ones", () => {
    expect(matchPerson("amaya perera", people)?.id).toBe("1");
    expect(matchPerson("Amaya", people)?.id).toBe("1");
    expect(matchPerson("Nuwan", people)).toBeNull();
    expect(matchPerson("Speaker", people)).toBeNull();
  });
  it("formats durations", () => { expect(fmtTalk(45)).toBe("45s"); expect(fmtTalk(125)).toBe("2m 05s"); expect(fmtTalk(3725)).toBe("1h 02m"); });
});
