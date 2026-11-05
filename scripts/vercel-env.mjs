// Pushes the variables in .env.vercel to the Vercel project (Production). Empty values and comment-only lines are skipped.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const file = process.argv[2] ?? ".env.vercel";
if (!existsSync(file)) { console.error(`Missing ${file} (copy .env.example to ${file} and fill it in)`); process.exit(1); }
if (!existsSync(".vercel/project.json")) { console.error("This folder is not linked to a Vercel project yet. Run: npx vercel login  and  npx vercel link"); process.exit(1); }

/** NAME=value, NAME="value" # comment, NAME=value  # comment. Returns null for lines that are not assignments. */
export function parseLine(line) {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;
  const eq = t.indexOf("=");
  if (eq < 1) return null;
  const name = t.slice(0, eq).trim();
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) return null;
  let rest = t.slice(eq + 1).trim();
  let value;
  if (rest.startsWith('"')) { const m = rest.match(/^"((?:[^"\\]|\\.)*)"/); value = m ? m[1] : rest.slice(1); }
  else if (rest.startsWith("'")) { const m = rest.match(/^'([^']*)'/); value = m ? m[1] : rest.slice(1); }
  else value = rest.split(/\s+#/)[0].trim();
  return { name, value: value.trim() };
}

if (process.argv[1] && process.argv[1].endsWith("vercel-env.mjs")) {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const p = parseLine(line);
    if (!p || !p.value) continue;
    const r = spawnSync("npx", ["vercel", "env", "add", p.name, "production", "--force"], { input: p.value, encoding: "utf8" });
    if (r.status !== 0) { console.error(`failed: ${p.name}\n${r.stderr}`); process.exit(1); }
    console.log(`set ${p.name}`);
  }
  console.log("Done. Redeploy for the new values to apply.");
}
