export const GOOGLE_LOGIN_SCOPES = ["openid", "email", "profile"];
// Calendar events (create Meet links), and read access to Meet transcripts for the notes taker.
export const GOOGLE_WORK_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/meetings.space.readonly",
];
export const ATLASSIAN_SCOPES = [
  "read:jira-work", "write:jira-work", "read:jira-user",
  "read:board-scope:jira-software", "read:sprint:jira-software", "write:sprint:jira-software",
  "offline_access",
];
