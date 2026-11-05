import { describe, expect, it } from "vitest";
import { isGenericSpeaker, matchSpeaker, norm, score, suggestPeople } from "../src/lib/speakers";

const people = [
  { id: "1", name: "Amaya Perera", email: "amaya.perera@x.com" },
  { id: "2", name: "Nuwan Silva", email: "nuwan.s@x.com" },
  { id: "3", name: "Nuwan Fernando", email: "nf@x.com" },
  { id: "4", name: "Nimal Rajapaksha", email: "nimal.r@x.com" },
];

describe("matchSpeaker", () => {
  it("matches full names, case and accents aside", () => { expect(matchSpeaker("AMAYA  perera", people)?.id).toBe("1"); expect(matchSpeaker("Nimál Rajapaksha", people)?.id).toBe("4"); });
  it("matches initials, short forms and typos", () => {
    expect(matchSpeaker("Nimal R.", people)?.id).toBe("4");
    expect(matchSpeaker("N. Rajapaksha", people)?.id).toBe("4");
    expect(matchSpeaker("Amaya Pereira", people)?.id).toBe("1");
  });
  it("matches a unique first name but not an ambiguous one", () => { expect(matchSpeaker("Amaya", people)?.id).toBe("1"); expect(matchSpeaker("Nuwan", people)).toBeNull(); expect(matchSpeaker("Nuwan Silva", people)?.id).toBe("2"); });
  it("matches an email-style name", () => { expect(matchSpeaker("amaya.perera", people)?.id).toBe("1"); });
  it("never guesses for generic or unknown names", () => { for (const n of ["Speaker", "Speaker A", "Guest 2", "Unknown", "Zed Quill"]) expect(matchSpeaker(n, people)).toBeNull(); });
  it("lets a saved alias win, even over a fuzzy match", () => { expect(matchSpeaker("Nuwan", people, { [norm("Nuwan")]: "3" })?.id).toBe("3"); expect(matchSpeaker("Room Laptop", people, { "room laptop": "1" })?.id).toBe("1"); });
});

describe("suggestPeople", () => {
  it("ranks candidates for one-click linking", () => {
    const s = suggestPeople("Nuwan", people);
    expect(s.map((c) => c.person.id).sort()).toEqual(["2", "3"]);
    expect(suggestPeople("Zed Quill", people)).toEqual([]);
  });
  it("scores 1 for an exact full name", () => { expect(score("amaya perera", people[0])).toBe(1); });
  it("recognises generic labels", () => { expect(isGenericSpeaker("Speaker B")).toBe(true); expect(isGenericSpeaker("Amaya")).toBe(false); });
});
