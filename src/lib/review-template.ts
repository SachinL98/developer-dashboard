// Prepared PR review template used for the initial Claude review and the reviewer's manual pass.
export type Severity = "critical" | "important";
export interface ReviewItem { id: string; label: string; severity: Severity; checked: boolean; note?: string; auto?: boolean }

export const REVIEW_TEMPLATE: Omit<ReviewItem, "checked">[] = [
  { id: "migrations", severity: "critical", label: "Migrations are safe, reversible and don't lock hot tables" },
  { id: "seeders", severity: "critical", label: "Seeders are idempotent and contain no production-unsafe data" },
  { id: "secrets", severity: "critical", label: "No secrets, tokens or credentials committed" },
  { id: "authz", severity: "critical", label: "Authentication / authorisation enforced on every new endpoint" },
  { id: "data-loss", severity: "critical", label: "No destructive queries or data-loss paths without guard" },
  { id: "scope", severity: "critical", label: "Change matches the ticket scope and acceptance criteria" },
  { id: "tests", severity: "important", label: "Tests added/updated for new behaviour and bug fixes" },
  { id: "n+1", severity: "important", label: "No N+1 queries or unbounded loops on large tables" },
  { id: "errors", severity: "important", label: "Errors handled and surfaced; no swallowed exceptions" },
  { id: "validation", severity: "important", label: "Input validated at boundaries" },
  { id: "logging", severity: "important", label: "No debug logging / leftover TODOs; useful logs for new flows" },
  { id: "api-compat", severity: "important", label: "Backwards-compatible API / contract changes documented" },
  { id: "config", severity: "important", label: "New env vars / config documented and defaulted safely" },
  { id: "docs", severity: "important", label: "Docs or changelog updated if behaviour changes" },
];

export const freshChecklist = (): ReviewItem[] => REVIEW_TEMPLATE.map((i) => ({ ...i, checked: false }));

/** Passing = every critical item checked (important items are advisory but reported). */
export const reviewPassed = (items: ReviewItem[]) => items.filter((i) => i.severity === "critical").every((i) => i.checked);

/** Heuristic diff scan used when no LLM key is configured — marks what it can prove, flags the rest. */
export function scanDiff(diff: string): ReviewItem[] {
  const items = freshChecklist();
  const files = [...diff.matchAll(/^diff --git a\/(\S+)/gm)].map((m) => m[1]);
  const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  const set = (id: string, checked: boolean, note?: string) => {
    const it = items.find((i) => i.id === id)!; it.checked = checked; it.note = note; it.auto = true;
  };
  const migrations = files.filter((f) => /migrat/i.test(f));
  const seeders = files.filter((f) => /seed/i.test(f));
  set("migrations", migrations.length === 0, migrations.length ? `Needs human eyes: ${migrations.join(", ")}` : "No migrations in this PR");
  set("seeders", seeders.length === 0, seeders.length ? `Needs human eyes: ${seeders.join(", ")}` : "No seeders in this PR");
  const secretRe = /(api[_-]?key|secret|token|passwd|password)\s*[:=]\s*['"][A-Za-z0-9_\-\/+=]{12,}['"]/i;
  const leak = added.find((l) => secretRe.test(l) || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(l));
  set("secrets", !leak, leak ? "Possible hard-coded secret in added lines" : "No obvious secrets");
  const dbg = added.filter((l) => /console\.log|debugger|print\(|var_dump|dd\(/.test(l)).length;
  const todo = added.filter((l) => /TODO|FIXME|XXX/.test(l)).length;
  set("logging", dbg + todo === 0, dbg + todo ? `${dbg} debug statements, ${todo} TODO/FIXME added` : "Clean");
  const touchedTests = files.some((f) => /(test|spec)/i.test(f));
  const touchedSrc = files.some((f) => !/(test|spec|\.md$|lock)/i.test(f));
  set("tests", !touchedSrc || touchedTests, touchedSrc && !touchedTests ? "Source changed but no test files touched" : "Tests touched");
  const dest = added.find((l) => /\b(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE|DELETE\s+FROM\s+\w+\s*;?\s*$)/i.test(l));
  set("data-loss", !dest, dest ? "Destructive SQL in added lines" : "No destructive SQL detected");
  set("docs", false, "Verify manually if behaviour changed");
  return items;
}
