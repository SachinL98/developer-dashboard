import { describe, expect, it } from "vitest";
import { zeptoBase } from "../src/lib/notify/email";

describe("zeptoBase", () => {
  it("defaults to the US host", () => { expect(zeptoBase("")).toBe("https://api.zeptomail.com"); expect(zeptoBase(undefined)).toBe("https://api.zeptomail.com"); });
  it("adds https when it is missing and drops trailing slashes", () => {
    expect(zeptoBase("api.zeptomail.eu")).toBe("https://api.zeptomail.eu");
    expect(zeptoBase(" https://api.zeptomail.in/ ")).toBe("https://api.zeptomail.in");
  });
});
