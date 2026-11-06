import { describe, expect, it } from "vitest";
import { sameName, uniqueMatch } from "../src/lib/name-match";

describe("sameName", () => {
  it.each([
    ["Sachin Lakshan", "sachin  lakshan"],
    ["Sachin Lakshan", "Lakshan Sachin"],
    ["Sachin Lakshan", "Sachin Lakshan Perera"],
    ["Sachin Lakshan", "Sachin K. Lakshan"],
    ["Sachin Lakshann", "Sachin Lakshan"],
    ["Zoë Müller", "Zoe Muller"],
  ])("%s = %s", (a, b) => expect(sameName(a, b)).toBe(true));
  it.each([
    ["Sachin Lakshan", "Sachin Perera"],
    ["Sachin Lakshan", "Nimal Lakshan"],
    ["Sam", "Sam Smith"],
    ["Amal Silva", "Amali Silva"],
    ["", "Sam Smith"],
  ])("%s != %s", (a, b) => expect(sameName(a, b)).toBe(false));
});

describe("uniqueMatch", () => {
  const list = [{ name: "Sachin Lakshan Perera" }, { name: "Nimal Fernando" }];
  it("returns the single match", () => expect(uniqueMatch("Sachin Lakshan", list)).toBe(list[0]));
  it("refuses when ambiguous", () => expect(uniqueMatch("Sachin Lakshan", [...list, { name: "Sachin Lakshan" }])).toBeNull());
  it("returns null when nothing matches", () => expect(uniqueMatch("Kamal Dias", list)).toBeNull());
});
