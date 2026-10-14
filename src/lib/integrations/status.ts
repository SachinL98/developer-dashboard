import { jiraConfigured } from "./jira";
import { githubConfigured } from "./github";
import { googleConfigured } from "./google";

export function integrationStatus() {
  return [
    { id: "jira", name: "Jira Cloud", configured: jiraConfigured(), env: ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT_KEY", "JIRA_BOARD_ID"], does: "Two-way ticket sync, sprint create/start/close, transitions, worklogs, estimates" },
    { id: "github", name: "GitHub", configured: githubConfigured(), env: ["GITHUB_TOKEN", "GITHUB_ORG"], does: "Org repos, PR state sync, diff scan for Claude review, merge webhooks" },
    { id: "google", name: "Google Calendar & Meet", configured: googleConfigured(), env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"], does: "Create recurring Meet events for the team cadence, import attendees and links" },
    { id: "claude", name: "Claude (notes & review)", configured: !!process.env.ANTHROPIC_API_KEY, env: ["ANTHROPIC_API_KEY"], does: "LLM meeting summaries (heuristic fallback otherwise)" },
  ];
}
