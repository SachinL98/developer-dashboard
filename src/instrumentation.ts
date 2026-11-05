/** Fails fast at server start in production when a security-critical setting is missing, instead of failing on the first request. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return;
  const problems: string[] = [];
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < 32) problems.push("AUTH_SECRET must be set to 32+ random characters (openssl rand -base64 48)");
  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL is not set");
  if (!process.env.APP_URL?.startsWith("https://") && process.env.ALLOW_INSECURE_APP_URL !== "true") problems.push("APP_URL must be the public https:// URL (set ALLOW_INSECURE_APP_URL=true only for a private test)");
  if (process.env.DEMO_MODE === "true") console.warn("[startup] DEMO_MODE is no longer used: sign-in is always email and password.");
  for (const k of ["CRON_SECRET", "JIRA_WEBHOOK_SECRET", "GITHUB_WEBHOOK_SECRET"]) if (!process.env[k]) console.warn(`[startup] ${k} is not set: the related endpoint is disabled.`);
  if (problems.length) throw new Error(`Refusing to start in production:\n - ${problems.join("\n - ")}`);
}
