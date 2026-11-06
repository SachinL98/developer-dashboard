// Global security notices: GitHub's advisory database (per package ecosystem) and CISA's list of vulnerabilities exploited in the wild.
// Fetching is separate from the pure parts below (normalising, ranking, matching the team's stack), which are unit tested.

export type Severity = "critical" | "high" | "medium" | "low" | "unknown";
export interface Advisory {
  id: string; cve: string | null; source: "github" | "cisa"; title: string; summary: string; severity: Severity; cvss: number | null;
  ecosystem: string | null; packages: { name: string; range: string | null; fixedIn: string | null }[]; published: string; url: string;
  exploited: boolean; ransomware?: boolean; action?: string; vendor?: string;
}
export interface SecurityConfig { ecosystems: string[]; keywords: string[] }
export const ECOSYSTEMS = ["composer", "npm", "pip", "maven", "go", "nuget", "rubygems", "rust"] as const;
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  ecosystems: ["composer", "npm"],
  keywords: ["php", "laravel", "symfony", "vue", "node", "nginx", "apache", "postgres", "redis", "openssl", "docker", "linux"],
};

const sev = (s: unknown): Severity => (["critical", "high", "medium", "low"].includes(String(s).toLowerCase()) ? (String(s).toLowerCase() as Severity) : "unknown");
const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** One GitHub advisory (REST shape) to our shape. */
export function fromGithub(a: any): Advisory | null {
  if (!a?.ghsa_id) return null;
  const vul = Array.isArray(a.vulnerabilities) ? a.vulnerabilities : [];
  return {
    id: a.ghsa_id, cve: a.cve_id ?? null, source: "github", title: clip(a.summary, 200), summary: clip(a.description, 700), severity: sev(a.severity),
    cvss: typeof a.cvss?.score === "number" && a.cvss.score > 0 ? a.cvss.score : null, ecosystem: vul[0]?.package?.ecosystem ?? null,
    packages: vul.slice(0, 6).map((v: any) => ({ name: String(v.package?.name ?? ""), range: v.vulnerable_version_range ?? null, fixedIn: v.first_patched_version ?? null })).filter((p: { name: string }) => p.name),
    published: a.published_at ?? new Date().toISOString(), url: a.html_url ?? `https://github.com/advisories/${a.ghsa_id}`, exploited: false,
  };
}

/** One CISA "known exploited" entry to our shape. Being on that list means attackers are using it now, so it counts as critical. */
export function fromKev(v: any): Advisory | null {
  if (!v?.cveID) return null;
  return {
    id: v.cveID, cve: v.cveID, source: "cisa", title: clip(v.vulnerabilityName || `${v.vendorProject} ${v.product}`, 200), summary: clip(v.shortDescription, 500), severity: "critical", cvss: null,
    ecosystem: null, packages: [{ name: `${v.vendorProject ?? ""} ${v.product ?? ""}`.trim(), range: null, fixedIn: null }].filter((p) => p.name),
    published: v.dateAdded ? `${v.dateAdded}T00:00:00Z` : new Date().toISOString(), url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`, exploited: true,
    ransomware: String(v.knownRansomwareCampaignUse ?? "").toLowerCase() === "known", action: clip(v.requiredAction, 300), vendor: clip(v.vendorProject, 80),
  };
}

/** Does this notice concern the team's stack? Ecosystem packages match by ecosystem; exploited vendor bugs match by keyword. */
export function matchesStack(a: Advisory, cfg: SecurityConfig): { match: boolean; why: string | null } {
  if (a.ecosystem && cfg.ecosystems.includes(a.ecosystem.toLowerCase())) return { match: true, why: `${a.ecosystem} package` };
  const hay = `${a.title} ${a.vendor ?? ""} ${a.packages.map((p) => p.name).join(" ")}`.toLowerCase();
  const hit = cfg.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean).find((k) => new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(hay));
  return hit ? { match: true, why: `mentions ${hit}` } : { match: false, why: null };
}

const W: Record<Severity, number> = { critical: 40, high: 28, medium: 14, low: 6, unknown: 8 };
/** Most important first: exploited in the wild, then severity, then whether it is our stack, then newer. Items from outside the stack only appear if they are exploited. */
export function rankAdvisories(items: Advisory[], cfg: SecurityConfig, now = new Date(), opts: { maxAgeDays?: number; limit?: number } = {}): (Advisory & { score: number; why: string | null })[] {
  const maxAge = (opts.maxAgeDays ?? 30) * 86_400_000;
  const seen = new Set<string>();
  const out = items.filter((a) => { const k = a.cve ?? a.id; if (seen.has(k) && !a.exploited) return false; seen.add(k); return true; })
    .map((a) => {
      const age = now.getTime() - new Date(a.published).getTime();
      const m = matchesStack(a, cfg);
      const score = W[a.severity] + (a.exploited ? 35 : 0) + (a.ransomware ? 10 : 0) + (m.match ? 20 : 0) + Math.max(0, 15 - (age / 86_400_000) * 0.7);
      return { ...a, score: Math.round(score), why: m.why, age, match: m.match };
    })
    .filter((a) => a.age >= 0 && a.age <= maxAge && (a.match || a.exploited))
    .sort((x, y) => y.score - x.score)
    .map(({ age: _a, match: _m, ...rest }) => rest);
  // The same CVE can arrive from both sources: keep the exploited (CISA) entry, which carries the required action.
  const byCve = new Map<string, (typeof out)[number]>();
  for (const a of out) { const k = a.cve ?? a.id; const prev = byCve.get(k); if (!prev || (a.exploited && !prev.exploited)) byCve.set(k, a); }
  const all = [...byCve.values()].sort((x, y) => y.score - x.score);
  const limit = opts.limit ?? 12;
  // Things attackers exploit are worth knowing even when they are not our stack, but they must not crowd out what is: at most two of them.
  const off = all.filter((x) => !x.why).slice(0, 2);
  const mine = all.filter((x) => x.why).slice(0, Math.max(0, limit - off.length));
  return [...mine, ...off].sort((x, y) => y.score - x.score);
}

// ---------- fetching ----------
const get = async (url: string, headers: Record<string, string> = {}) => {
  const res = await fetch(url, { headers: { "user-agent": "dev-dashboard-security-board", ...headers }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.json();
};

export async function fetchGithubAdvisories(ecosystem: string, perPage = 25): Promise<Advisory[]> {
  const token = process.env.GITHUB_TOKEN;
  const data = await get(`https://api.github.com/advisories?ecosystem=${encodeURIComponent(ecosystem)}&type=reviewed&per_page=${perPage}&sort=published&direction=desc`,
    { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}) });
  return (Array.isArray(data) ? data : []).map(fromGithub).filter((x): x is Advisory => !!x);
}

export async function fetchKev(days = 30): Promise<Advisory[]> {
  const data = await get("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json");
  const since = Date.now() - days * 86_400_000;
  return (data.vulnerabilities ?? []).filter((v: any) => new Date(`${v.dateAdded}T00:00:00Z`).getTime() >= since).map(fromKev).filter((x: Advisory | null): x is Advisory => !!x);
}
