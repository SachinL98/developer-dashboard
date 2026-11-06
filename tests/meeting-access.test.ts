import { describe, expect, it } from "vitest";
import { canEditMeeting, resolveOwner } from "../src/lib/meeting-access";

const dev = { access: "DEVELOPER" as const, email: "sam@x.com", name: "Sam Perera" };
describe("canEditMeeting", () => {
  it("lets leads and admins edit anything", () => { expect(canEditMeeting({ ...dev, access: "LEAD" }, ["Someone Else"])).toBe(true); });
  it("lets attendees edit, by email, name or first name", () => {
    expect(canEditMeeting(dev, ["sam@x.com"])).toBe(true);
    expect(canEditMeeting(dev, ["Sam Perera"])).toBe(true);
    expect(canEditMeeting(dev, ["sam"])).toBe(true);
  });
  it("keeps non-attendees out, and stays open when no attendees are known", () => {
    expect(canEditMeeting(dev, ["Kim Jones", "kim@x.com"])).toBe(false);
    expect(canEditMeeting(dev, [])).toBe(true);
  });
});
describe("resolveOwner", () => {
  const people = [{ id: "1", name: "Sam Perera", email: "sam@x.com" }, { id: "2", name: "Kim Jones", email: "kim@x.com" }, { id: "3", name: "Kim Lee", email: "kl@x.com" }];
  it("matches full names and unique first names", () => { expect(resolveOwner("Sam", people)).toBe("1"); expect(resolveOwner("kim jones", people)).toBe("2"); });
  it("refuses ambiguous or unknown owners", () => { expect(resolveOwner("Kim", people)).toBeNull(); expect(resolveOwner("Zed", people)).toBeNull(); expect(resolveOwner("", people)).toBeNull(); });
});
