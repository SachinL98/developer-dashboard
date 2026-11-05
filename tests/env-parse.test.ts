import { describe, expect, it } from "vitest";
// @ts-expect-error plain ES module script
import { parseLine } from "../scripts/vercel-env.mjs";

describe("vercel-env parseLine", () => {
  it("treats an empty quoted value followed by a comment as empty", () => {
    expect(parseLine('JIRA_BOARD_ID=""                            # Scrum board id')).toEqual({ name: "JIRA_BOARD_ID", value: "" });
    expect(parseLine('GITHUB_TOKEN=""   # fine-grained token')).toEqual({ name: "GITHUB_TOKEN", value: "" });
    expect(parseLine("X=")).toEqual({ name: "X", value: "" });
  });
  it("reads quoted and bare values, dropping trailing comments", () => {
    expect(parseLine('APP_URL="https://a.b"  # public url')).toEqual({ name: "APP_URL", value: "https://a.b" });
    expect(parseLine("TEAM_TIMEZONE=Asia/Colombo   # tz")).toEqual({ name: "TEAM_TIMEZONE", value: "Asia/Colombo" });
    expect(parseLine('URL="postgresql://u:p#w@h/db?x=1"')).toEqual({ name: "URL", value: "postgresql://u:p#w@h/db?x=1" });
  });
  it("ignores comments and blanks", () => {
    expect(parseLine("# comment")).toBeNull();
    expect(parseLine("   ")).toBeNull();
    expect(parseLine("not an assignment")).toBeNull();
  });
});
