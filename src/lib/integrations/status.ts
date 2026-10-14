import { githubConfigured } from "./github";
import { googleOAuthConfigured } from "./google";
import { jiraProjectConfigured } from "./jira";
import { atlassianConfigured, demoMode } from "../auth/oauth";

export interface EnvCheck { name: string; ok: boolean; hint: string }

/** What an admin still has to configure on the server. Names only: values are never exposed. */
export function setupChecklist(): { group: string; items: EnvCheck[] }[] {
  const has = (k: string) => !!process.env[k];
  return [
    { group: "Core", items: [
      { name: "APP_URL", ok: has("APP_URL"), hint: "Public URL, e.g. https://dev.spaceitlabs.com. Used for OAuth redirect URIs." },
      { name: "AUTH_SECRET", ok: (process.env.AUTH_SECRET?.length ?? 0) >= 32, hint: "32+ random chars (openssl rand -base64 48). Encrypts stored OAuth tokens." },
      { name: "ADMIN_EMAILS", ok: has("ADMIN_EMAILS"), hint: "Comma-separated emails that become admins on first sign-in." },
      { name: "CRON_SECRET", ok: has("CRON_SECRET"), hint: "Bearer token for /api/cron/* (scheduled Jira sync and transcript import)." },
    ] },
    { group: "Google sign-in, Calendar and Meet", items: [
      { name: "GOOGLE_CLIENT_ID", ok: has("GOOGLE_CLIENT_ID"), hint: "OAuth client (Web). Consent screen user type: Internal." },
      { name: "GOOGLE_CLIENT_SECRET", ok: has("GOOGLE_CLIENT_SECRET"), hint: "Secret of the same client." },
      { name: "AUTH_ALLOWED_DOMAIN", ok: has("AUTH_ALLOWED_DOMAIN"), hint: "Defaults to spaceitlabs.com." },
    ] },
    { group: "Jira Cloud", items: [
      { name: "ATLASSIAN_CLIENT_ID", ok: has("ATLASSIAN_CLIENT_ID"), hint: "OAuth 2.0 (3LO) app from developer.atlassian.com." },
      { name: "ATLASSIAN_CLIENT_SECRET", ok: has("ATLASSIAN_CLIENT_SECRET"), hint: "Secret of the same app." },
      { name: "JIRA_PROJECT_KEY", ok: jiraProjectConfigured(), hint: "Project the dashboard creates tickets in." },
      { name: "JIRA_BOARD_ID", ok: has("JIRA_BOARD_ID"), hint: "Scrum board id, for sprint create/start/close." },
      { name: "JIRA_WEBHOOK_SECRET", ok: has("JIRA_WEBHOOK_SECRET"), hint: "Shared secret on the Jira webhook URL." },
    ] },
    { group: "GitHub", items: [
      { name: "GITHUB_TOKEN", ok: githubConfigured(), hint: "Fine-grained token (read pull requests and contents) for the org repos." },
      { name: "GITHUB_WEBHOOK_SECRET", ok: has("GITHUB_WEBHOOK_SECRET"), hint: "Secret on the pull_request webhook." },
    ] },
  ];
}

export const authMode = () => (googleOAuthConfigured() ? "google" : demoMode() ? "demo" : "unconfigured") as "google" | "demo" | "unconfigured";
export { atlassianConfigured };
