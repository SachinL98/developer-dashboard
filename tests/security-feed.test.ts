import { describe, expect, it } from "vitest";
import { fromGithub, fromKev, matchesStack, rankAdvisories, DEFAULT_SECURITY_CONFIG as CFG } from "../src/lib/security-feed";

const now = new Date("2026-11-06T00:00:00Z");
const gh = (o: any = {}) => fromGithub({ ghsa_id: "GHSA-1", cve_id: "CVE-1", summary: "Remote code execution in laravel/framework", description: "bad", severity: "critical", cvss: { score: 9.8 }, published_at: "2026-11-04T00:00:00Z", html_url: "u", vulnerabilities: [{ package: { ecosystem: "composer", name: "laravel/framework" }, vulnerable_version_range: "< 11.9", first_patched_version: "11.9" }], ...o })!;
const kev = (o: any = {}) => fromKev({ cveID: "CVE-9", vendorProject: "PHP Group", product: "PHP", vulnerabilityName: "PHP-CGI argument injection", dateAdded: "2026-11-03", shortDescription: "d", requiredAction: "Apply updates", knownRansomwareCampaignUse: "Known", ...o })!;

describe("normalising", () => {
  it("reads a GitHub advisory with its fixed version", () => { const a = gh(); expect(a).toMatchObject({ id: "GHSA-1", severity: "critical", cvss: 9.8, ecosystem: "composer", exploited: false }); expect(a.packages[0]).toMatchObject({ name: "laravel/framework", fixedIn: "11.9" }); });
  it("treats a CISA entry as exploited and critical", () => { expect(kev()).toMatchObject({ exploited: true, severity: "critical", ransomware: true, vendor: "PHP Group" }); });
  it("ignores junk", () => { expect(fromGithub({})).toBeNull(); expect(fromKev({})).toBeNull(); });
});
describe("matchesStack", () => {
  it("matches watched ecosystems and keywords, and nothing else", () => {
    expect(matchesStack(gh(), CFG).match).toBe(true);
    expect(matchesStack(kev(), CFG)).toMatchObject({ match: true, why: "mentions php" });
    expect(matchesStack(kev({ vendorProject: "Zyxel", product: "Router", vulnerabilityName: "Zyxel router flaw" }), CFG).match).toBe(false);
    expect(matchesStack(gh({ vulnerabilities: [{ package: { ecosystem: "maven", name: "x" } }], summary: "Java thing" }), CFG).match).toBe(false);
  });
});
describe("rankAdvisories", () => {
  it("puts exploited and critical stack items first, drops old and off-stack ones", () => {
    const items = [
      gh({ ghsa_id: "G-med", cve_id: "C-med", severity: "medium" }), kev(), gh({ ghsa_id: "G-old", cve_id: "C-old", published_at: "2026-08-01T00:00:00Z" }),
      kev({ cveID: "CVE-Z", vendorProject: "Zyxel", product: "Router", vulnerabilityName: "Zyxel router flaw" }), gh({ ghsa_id: "G-crit", cve_id: "C-crit" }),
    ];
    const r = rankAdvisories(items, CFG, now);
    expect(r[0].id).toBe("CVE-9");
    expect(r.map((x) => x.id)).not.toContain("G-old");
    expect(r.map((x) => x.id)).toContain("CVE-Z"); // exploited items always show, even off-stack
    expect(r.findIndex((x) => x.id === "G-crit")).toBeLessThan(r.findIndex((x) => x.id === "G-med"));
  });
  it("keeps the CISA entry when both sources report the same CVE", () => {
    const r = rankAdvisories([gh({ ghsa_id: "G-same", cve_id: "CVE-9" }), kev()], CFG, now);
    expect(r.filter((x) => x.cve === "CVE-9")).toHaveLength(1);
    expect(r.find((x) => x.cve === "CVE-9")!.exploited).toBe(true);
  });
  it("caps exploited items from outside the stack so stack items still show", () => {
    const off = ["A", "B", "C", "D"].map((n) => kev({ cveID: `CVE-${n}`, vendorProject: `Vendor${n}`, product: "Box", vulnerabilityName: `Vendor${n} flaw` }));
    const r = rankAdvisories([...off, gh({ ghsa_id: "G-crit", cve_id: "C-crit" })], CFG, now, { limit: 4 });
    expect(r.filter((x) => !x.why)).toHaveLength(2);
    expect(r.map((x) => x.id)).toContain("G-crit");
  });
});
