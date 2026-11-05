import { githubConfigured } from "./github";
import { googleOAuthConfigured } from "./google";
import { jiraProjectConfigured } from "./jira";
import { atlassianConfigured } from "../auth/oauth";

export interface EnvCheck { name: string; ok: boolean; hint: string }

/** What an admin still has to configure on the server. Names only: values are never exposed. */
export function setupChecklist(): { group: string; items: EnvCheck[] }[] {
  const has = (k: string) => !!process.env[k];
  return [
    { group: "Core", items: [
      { name: "APP_URL", ok: has("APP_URL"), hint: "Public URL, e.g. https://dashboard.example.com. Used for OAuth redirect URIs." },
      { name: "AUTH_SECRET", ok: (process.env.AUTH_SECRET?.length ?? 0) >= 32, hint: "32+ random chars (openssl rand -base64 48). Encrypts stored OAuth tokens." },
      { name: "ADMIN_EMAILS", ok: has("ADMIN_EMAILS"), hint: "Optional: accounts created with these emails get the Admin role." },
      { name: "CRON_SECRET", ok: has("CRON_SECRET"), hint: "Bearer token for /api/cron/* (scheduled Jira sync and transcript import)." },
    ] },
    { group: "Google Calendar and Meet (optional)", items: [
      { name: "GOOGLE_CLIENT_ID", ok: has("GOOGLE_CLIENT_ID"), hint: "OAuth client (Web). Consent screen user type: Internal." },
      { name: "GOOGLE_CLIENT_SECRET", ok: has("GOOGLE_CLIENT_SECRET"), hint: "Secret of the same client." },
    ] },
    { group: "Jira Cloud", items: [
      { name: "ATLASSIAN_CLIENT_ID", ok: has("ATLASSIAN_CLIENT_ID"), hint: "OAuth 2.0 (3LO) app from developer.atlassian.com." },
      { name: "ATLASSIAN_CLIENT_SECRET", ok: has("ATLASSIAN_CLIENT_SECRET"), hint: "Secret of the same app." },
      { name: "JIRA_PROJECT_KEY", ok: jiraProjectConfigured(), hint: "Project the dashboard creates tickets in." },
      { name: "JIRA_BOARD_ID", ok: has("JIRA_BOARD_ID"), hint: "Scrum board id, for sprint create/start/close." },
      { name: "JIRA_WEBHOOK_SECRET", ok: has("JIRA_WEBHOOK_SECRET"), hint: "Shared secret on the Jira webhook URL." },
    ] },
    { group: "AI (optional server-wide keys)", items: [
      { name: "ANTHROPIC_API_KEY", ok: has("ANTHROPIC_API_KEY"), hint: "Optional shared Claude key, used when someone has not added their own key in Settings." },
      { name: "OPENAI_API_KEY", ok: has("OPENAI_API_KEY"), hint: "Optional shared OpenAI key (same fallback)." },
      { name: "GEMINI_API_KEY", ok: has("GEMINI_API_KEY"), hint: "Optional shared Google Gemini key (same fallback)." },
    ] },
    { group: "GitHub", items: [
      { name: "GITHUB_TOKEN", ok: githubConfigured(), hint: "Fine-grained token (read pull requests and contents) for the org repos." },
      { name: "GITHUB_WEBHOOK_SECRET", ok: has("GITHUB_WEBHOOK_SECRET"), hint: "Secret on the pull_request webhook." },
    ] },
  ];
}

export { atlassianConfigured };

export interface SetupStep {
  id: string; title: string; summary: string; optional?: boolean; done: boolean;
  steps: string[]; // plain numbered instructions
  copy?: { label: string; value: string }[]; // values to paste into the other system
  vars: { name: string; ok: boolean }[]; // settings to add on the server
}

/** The whole admin setup as a short ordered guide. Names and yes/no only: values are never exposed. */
export function setupGuide(origin: string): SetupStep[] {
  const has = (k: string) => !!process.env[k];
  const v = (name: string, ok = has(name)) => ({ name, ok });
  const all = (xs: { ok: boolean }[]) => xs.every((x) => x.ok);
  const basics = [v("APP_URL"), v("AUTH_SECRET", (process.env.AUTH_SECRET?.length ?? 0) >= 32)];
  const google = [v("GOOGLE_CLIENT_ID"), v("GOOGLE_CLIENT_SECRET")];
  const jira = [v("ATLASSIAN_CLIENT_ID"), v("ATLASSIAN_CLIENT_SECRET"), v("JIRA_PROJECT_KEY", jiraProjectConfigured()), v("JIRA_BOARD_ID")];
  const github = [v("GITHUB_TOKEN", githubConfigured()), v("GITHUB_ORG"), v("GITHUB_WEBHOOK_SECRET")];
  const auto = [v("CRON_SECRET"), v("JIRA_WEBHOOK_SECRET")];
  return [
    { id: "basics", title: "Basic settings", summary: "Tell the server its address and a secret.", done: all(basics), vars: basics, steps: [
      "Set APP_URL to the address people use, for example https://dashboard.example.com.",
      "Set AUTH_SECRET to a long random text. Run: openssl rand -base64 48",
      "Create the first admin from a terminal: npm run user:create -- --email you@company.com --name \"Your Name\" --access ADMIN. It saves a one-time password to a private file. Sign in, then choose your own password. Add everyone else in Admin, then Users.",
    ] },
    { id: "google", title: "Google Calendar and Meet", optional: true, summary: "Optional. Creates meeting links and reads transcripts. Sign-in does not use Google.", done: all(google), vars: google,
      copy: [{ label: "Redirect URI", value: `${origin}/api/auth/google/callback` }], steps: [
      "Open console.cloud.google.com, go to APIs & Services, then Credentials, and create an OAuth client of type Web application.",
      "Paste the Redirect URI below into Authorised redirect URIs.",
      "Copy the Client ID and Client secret into GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      "Restart the app. Then press Connect on the Google card above.",
    ] },
    { id: "jira", title: "Jira", summary: "Syncs tickets, sprints and estimates.", done: all(jira), vars: jira,
      copy: [{ label: "Callback URL", value: `${origin}/api/auth/atlassian/callback` }], steps: [
      "Open developer.atlassian.com, create an OAuth 2.0 (3LO) app and paste the Callback URL below.",
      "Copy its Client ID and Secret into ATLASSIAN_CLIENT_ID and ATLASSIAN_CLIENT_SECRET.",
      "Set JIRA_PROJECT_KEY (for example ATL) and JIRA_BOARD_ID (the number in your Scrum board's address).",
      "Restart the app. Then press Connect on the Jira card above.",
    ] },
    { id: "github", title: "GitHub pull requests", summary: "Links pull requests to tickets for code review.", done: all(github), vars: github,
      copy: [{ label: "Webhook URL", value: `${origin}/api/webhooks/github` }], steps: [
      "In GitHub, create a fine-grained token with read access to Pull requests and Contents. Put it in GITHUB_TOKEN, and your organisation name in GITHUB_ORG.",
      "In the organisation settings, add a webhook with the Webhook URL below, the event Pull requests, and a secret you choose.",
      "Put the same secret in GITHUB_WEBHOOK_SECRET.",
    ] },
    { id: "auto", title: "Automatic updates", summary: "Keeps Jira and meeting transcripts up to date by themselves.", done: all(auto), vars: auto,
      copy: [{ label: "Run every 10 minutes", value: `GET ${origin}/api/cron/sync` }, { label: "Also every 10 minutes", value: `GET ${origin}/api/cron/transcripts` }, { label: "Jira webhook URL", value: `${origin}/api/webhooks/jira?secret=YOUR_JIRA_WEBHOOK_SECRET` }], steps: [
      "Set CRON_SECRET and JIRA_WEBHOOK_SECRET to long random texts.",
      "In your scheduler, call the two addresses below every 10 minutes with the header Authorization: Bearer <CRON_SECRET>.",
      "In Jira, add a webhook with the Jira webhook URL below (replace the end with your secret).",
    ] },
    { id: "alerts", title: "Email and Discord alerts", summary: "Optional. Overdue-ticket messages and start-of-day reminders.", optional: true,
      done: !!(has("ZEPTOMAIL_TOKEN") || (has("ZOHO_SMTP_USER") && has("ZOHO_SMTP_PASSWORD")) || has("DISCORD_BOT_TOKEN") || has("DISCORD_WEBHOOK_URL")),
      vars: [v("EMAIL_FROM"), v("ZEPTOMAIL_TOKEN"), v("ZOHO_SMTP_USER"), v("ZOHO_SMTP_PASSWORD"), v("DISCORD_BOT_TOKEN"), v("DISCORD_WEBHOOK_URL")], steps: [
      "Email with ZeptoMail: create a Mail Agent, verify your sending domain, copy its Send Mail token into ZEPTOMAIL_TOKEN (add ZEPTOMAIL_URL for the EU or India region).",
      "Or email with Zoho Mail: create an app password for a mailbox and set ZOHO_SMTP_USER and ZOHO_SMTP_PASSWORD (ZOHO_SMTP_HOST for other regions).",
      "Set EMAIL_FROM to a verified sender address.",
      "Discord: either create a bot (discord.com/developers), add it to your server and set DISCORD_BOT_TOKEN so it can message people directly, or create a channel webhook and set DISCORD_WEBHOOK_URL. Each person adds their Discord user id in Settings.",
      "Open Admin, then Alerts, and press Send a test to me. Alerts run every 10 minutes from the scheduled sync.",
    ] },
    { id: "ai", title: "AI for the whole team", summary: "Optional. Each person can add their own Claude, Gemini or OpenAI key in Settings.", optional: true, done: has("ANTHROPIC_API_KEY") || has("OPENAI_API_KEY") || has("GEMINI_API_KEY"), vars: [v("ANTHROPIC_API_KEY"), v("OPENAI_API_KEY"), v("GEMINI_API_KEY")], steps: [
      "Create a key with Claude (console.anthropic.com), OpenAI (platform.openai.com) or Gemini (aistudio.google.com) and set the matching setting. It is used for AI features, including pull request reviews, by anyone who has not added their own key.",
    ] },
  ];
}
