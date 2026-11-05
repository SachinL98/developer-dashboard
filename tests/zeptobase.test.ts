import { describe, expect, it } from "vitest";
import { zeptoBase } from "../src/lib/notify/email";

describe("zeptoBase", () => {
  it("defaults to the EU host", () => { expect(zeptoBase("")).toBe("https://api.zeptomail.eu"); expect(zeptoBase(undefined)).toBe("https://api.zeptomail.eu"); });
  it("adds https when it is missing and drops trailing slashes", () => {
    expect(zeptoBase("api.zeptomail.eu")).toBe("https://api.zeptomail.eu");
    expect(zeptoBase(" https://api.zeptomail.in/ ")).toBe("https://api.zeptomail.in");
    expect(zeptoBase("https://api.zeptomail.eu/v1.1/email")).toBe("https://api.zeptomail.eu");
  });
});
