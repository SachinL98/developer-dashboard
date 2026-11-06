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

import { pickJiraTwin } from "../src/lib/jira-people";
import { firstNameOnly } from "../src/lib/name-match";

const P = (id: string, name: string, pw: boolean) => ({ id, name, passwordHash: pw ? "x" : null, jiraAccount: pw ? null : "j" + id }) as never;

describe("first-name-only accounts", () => {
  it("matches a one-word name to a longer Jira name's first word", () => {
    expect(firstNameOnly("ishara", "Ishara Sandaruwan")).toBe(true);
    expect(firstNameOnly("ishara", "Nimal Ishara")).toBe(false);
    expect(firstNameOnly("Ishara Perera", "Ishara Sandaruwan")).toBe(false);
    expect(firstNameOnly("al", "Al Smith")).toBe(false);
  });
  it("links 'ishara' to the one Jira Ishara", () => {
    const acct = P("a", "ishara", true), jira = [P("j1", "Ishara Sandaruwan", false), P("j2", "Nimal Fernando", false)];
    expect(pickJiraTwin(acct, jira, [acct])?.id).toBe("j1");
  });
  it("does nothing when two Jira people share the first name", () => {
    const acct = P("a", "ishara", true);
    expect(pickJiraTwin(acct, [P("j1", "Ishara Sandaruwan", false), P("j2", "Ishara Perera", false)], [acct])).toBeNull();
  });
  it("does nothing when two accounts could claim the same Jira person", () => {
    const a = P("a", "ishara", true), b = P("b", "Ishara", true);
    expect(pickJiraTwin(a, [P("j1", "Ishara Sandaruwan", false)], [a, b])).toBeNull();
  });
  it("prefers a full-name match over a first-name one", () => {
    const acct = P("a", "Ishara Sandaruwan", true);
    expect(pickJiraTwin(acct, [P("j1", "Ishara Sandaruwan", false), P("j2", "Ishara Perera", false)], [acct])?.id).toBe("j1");
  });
});
