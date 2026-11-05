// Pushes the variables in .env.vercel to the Vercel project (Production). Empty values and comment-only lines are skipped.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parseLine } from "./env-parse.mjs";

const file = process.argv[2] ?? ".env.vercel";
if (!existsSync(file)) { console.error(`Missing ${file} (copy .env.example to ${file} and fill it in)`); process.exit(1); }
if (!existsSync(".vercel/project.json")) { console.error("This folder is not linked to a Vercel project yet. Run: npx vercel login  and  npx vercel link"); process.exit(1); }

{
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const p = parseLine(line);
    if (!p || !p.value) continue;
    const r = spawnSync("npx", ["vercel", "env", "add", p.name, "production", "--force"], { input: p.value, encoding: "utf8" });
    if (r.status !== 0) { console.error(`failed: ${p.name}\n${r.stderr}`); process.exit(1); }
    console.log(`set ${p.name}`);
  }
  console.log("Done. Redeploy for the new values to apply.");
}
