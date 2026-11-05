import { describe, expect, it } from "vitest";
import { zeptoBase } from "../src/lib/notify/email";

describe("zeptoBase", () => {
  it("defaults to cpaas.zoho.com", () => { expect(zeptoBase("")).toBe("https://cpaas.zoho.com"); expect(zeptoBase(undefined)).toBe("https://cpaas.zoho.com"); });
  it("adds https when it is missing and drops trailing slashes", () => {
    expect(zeptoBase("api.zeptomail.eu")).toBe("https://api.zeptomail.eu");
    expect(zeptoBase(" https://api.zeptomail.in/ ")).toBe("https://api.zeptomail.in");
    expect(zeptoBase("https://cpaas.zoho.com/v1.1/email")).toBe("https://cpaas.zoho.com");
  });
});
