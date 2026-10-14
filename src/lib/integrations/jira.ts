import { request, IntegrationError } from "./http";
import type { StatusKey } from "../workflow";
import { STATUS_META } from "../workflow";

import { boundUserId } from "../context";
import { accessTokenFor, getConnection } from "./connections";

const env = () => ({
  base: process.env.JIRA_BASE_URL?.replace(/\/$/, ""), email: process.env.JIRA_EMAIL, token: process.env.JIRA_API_TOKEN,
  project: process.env.JIRA_PROJECT_KEY, board: process.env.JIRA_BOARD_ID, spField: process.env.JIRA_STORY_POINTS_FIELD || "customfield_10016",
  sprintField: process.env.JIRA_SPRINT_FIELD || "customfield_10020",
});

/** Optional org-wide service account (basic auth). Per-user OAuth connections are preferred when present. */
const serviceAccount = () => { const e = env(); return !!(e.base && e.email && e.token); };

interface JiraAuth { base: string; headers: Record<string, string>; siteUrl: string; via: "oauth" | "service" }

/** Credentials for the current request: the signed-in user's OAuth connection, else the service account. */
async function resolveAuth(): Promise<JiraAuth> {
  const uid = boundUserId();
  const conn = uid ? await getConnection(uid, "JIRA") : null;
  if (conn?.cloudId) {
    return { base: `https://api.atlassian.com/ex/jira/${conn.cloudId}`, headers: { Authorization: `Bearer ${await accessTokenFor(conn)}` }, siteUrl: conn.siteUrl ?? "", via: "oauth" };
  }
  const e = env();
  if (serviceAccount()) return { base: e.base!, headers: { Authorization: "Basic " + Buffer.from(`${e.email}:${e.token}`).toString("base64") }, siteUrl: e.base!, via: "service" };
  throw new IntegrationError("Jira", "not connected — connect your Jira account in Integrations");
}

/** True when a Jira call can be made now (user connected or service account set) and the team project is configured. */
export async function jiraReady(): Promise<boolean> {
  if (!env().project) return false;
  try { await resolveAuth(); return true; } catch { return false; }
}
export const jiraProjectConfigured = () => !!env().project;

const call = async <T>(path: string, init: RequestInit = {}) => {
  const auth = await resolveAuth();
  return request<T>("Jira", `${auth.base}${path}`, { ...init, headers: { ...auth.headers, "Content-Type": "application/json", ...(init.headers ?? {}) } });
};

/** Link to an issue in the Jira UI for the current user's site. */
export async function jiraBrowseUrl(key: string): Promise<string | null> {
  try { return `${(await resolveAuth()).siteUrl}/browse/${key}`; } catch { return null; }
}

const adf = (text: string) => ({ type: "doc", version: 1, content: text.split("\n").map((l) => ({ type: "paragraph", content: l ? [{ type: "text", text: l }] : [] })) });
const adfText = (n: any): string => !n ? "" : n.text ?? (n.content ?? []).map(adfText).join(n.type === "doc" ? "\n" : "");

/** Map a Jira status name to a board column key (by name, case/space-insensitive). */
export function statusFromJira(name: string): StatusKey | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const hit = (Object.keys(STATUS_META) as StatusKey[]).find((k) => norm(STATUS_META[k].label) === norm(name));
  if (hit) return hit;
  const n = norm(name);
  if (n.includes("stag") && n.includes("fail")) return "FAILED_STG";
  if (n.includes("stg") || n.includes("staging")) return "DEPLOYED_STG";
  if (n.includes("prod")) return "DEPLOYED_PROD";
  return null;
}

export interface JiraIssue {
  key: string; title: string; description: string; type: string; priority: string; status: string; points: number | null;
  assigneeEmail?: string; assigneeId?: string; sprintId?: string; sprintName?: string; labels: string[]; estimateHrs: number | null;
}

/** The sprint field is an array of every sprint the issue has been in: prefer the active one, else the newest. */
function pickSprint(v: any): { sprintId?: string; sprintName?: string } {
  const list: any[] = Array.isArray(v) ? v : v ? [v] : [];
  const s = list.find((x) => x.state === "active") ?? list.filter((x) => x.state !== "closed").pop() ?? undefined;
  return s ? { sprintId: String(s.id), sprintName: s.name } : {};
}

const mapType = (t: string) => (/bug/i.test(t) ? "BUG" : /story|feature|epic/i.test(t) ? "FEATURE" : /improve|enhance/i.test(t) ? "ENHANCEMENT" : "TASK");
const mapPriority = (p?: string) => (/highest|blocker|critical/i.test(p ?? "") ? "CRITICAL" : /high/i.test(p ?? "") ? "HIGH" : /low/i.test(p ?? "") ? "LOW" : "MEDIUM");

export async function searchIssues(jql?: string): Promise<JiraIssue[]> {
  const e = env();
  const query = jql ?? `project = ${e.project} AND (sprint in openSprints() OR sprint is EMPTY) ORDER BY Rank ASC`;
  const out: JiraIssue[] = [];
  let nextPageToken: string | undefined;
  do {
    const data: any = await call("/rest/api/3/search/jql", {
      method: "POST",
      body: JSON.stringify({ jql: query, maxResults: 100, nextPageToken, fields: ["summary", "description", "issuetype", "priority", "status", "assignee", "labels", "timeoriginalestimate", e.sprintField, e.spField] }),
    });
    for (const i of data.issues ?? []) {
      const f = i.fields;
      out.push({
        key: i.key, title: f.summary, description: adfText(f.description), type: mapType(f.issuetype?.name ?? ""), priority: mapPriority(f.priority?.name),
        status: f.status?.name ?? "", points: f[e.spField] ?? null, assigneeEmail: f.assignee?.emailAddress, assigneeId: f.assignee?.accountId,
        ...pickSprint(f[e.sprintField]), labels: f.labels ?? [],
        estimateHrs: f.timeoriginalestimate ? f.timeoriginalestimate / 3600 : null,
      });
    }
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);
  return out;
}

export async function createIssue(i: { title: string; description: string; type: string; priority: string; points?: number | null; labels?: string[]; estimateHrs?: number | null; assigneeAccountId?: string }) {
  const e = env();
  const typeName = { BUG: "Bug", FEATURE: "Story", ENHANCEMENT: "Improvement", TASK: "Task" }[i.type] ?? "Task";
  const priorityName = { CRITICAL: "Highest", HIGH: "High", MEDIUM: "Medium", LOW: "Low" }[i.priority] ?? "Medium";
  const fields: any = { project: { key: e.project }, summary: i.title, description: adf(i.description || i.title), issuetype: { name: typeName }, priority: { name: priorityName }, labels: i.labels ?? [] };
  if (i.points != null) fields[e.spField] = i.points;
  if (i.estimateHrs != null) fields.timetracking = { originalEstimate: `${Math.round(i.estimateHrs * 60)}m` };
  if (i.assigneeAccountId) fields.assignee = { accountId: i.assigneeAccountId };
  const res = await call<{ key: string }>("/rest/api/3/issue", { method: "POST", body: JSON.stringify({ fields }) });
  return res.key;
}

export async function updateEstimate(key: string, p: { points?: number | null; hours?: number | null }) {
  const e = env();
  const fields: any = {};
  if (p.points != null) fields[e.spField] = p.points;
  if (p.hours != null) fields.timetracking = { originalEstimate: `${Math.round(p.hours * 60)}m` };
  await call(`/rest/api/3/issue/${key}`, { method: "PUT", body: JSON.stringify({ fields }) });
}

/** Move an issue to the Jira status named like our column (transitions are looked up by target status). */
export async function transitionIssue(key: string, to: StatusKey) {
  const data = await call<{ transitions: { id: string; to: { name: string } }[] }>(`/rest/api/3/issue/${key}/transitions`);
  const hit = data.transitions.find((t) => statusFromJira(t.to.name) === to);
  if (!hit) throw new IntegrationError("Jira", `No transition from current status to "${STATUS_META[to].label}" on ${key}`);
  await call(`/rest/api/3/issue/${key}/transitions`, { method: "POST", body: JSON.stringify({ transition: { id: hit.id } }) });
}

export async function addWorklog(key: string, startedAt: Date, seconds: number, comment?: string) {
  await call(`/rest/api/3/issue/${key}/worklog`, {
    method: "POST",
    body: JSON.stringify({ started: startedAt.toISOString().replace("Z", "+0000"), timeSpentSeconds: Math.max(60, Math.round(seconds)), comment: comment ? adf(comment) : undefined }),
  });
}

export async function addComment(key: string, text: string) {
  await call(`/rest/api/3/issue/${key}/comment`, { method: "POST", body: JSON.stringify({ body: adf(text) }) });
}

// ---- Agile (sprints) ----
export async function listSprints(state = "active,future") {
  const e = env();
  const data = await call<{ values: { id: number; name: string; state: string; startDate?: string; endDate?: string; goal?: string }[] }>(`/rest/agile/1.0/board/${e.board}/sprint?state=${state}`);
  return data.values;
}
export async function createSprint(name: string, start: Date, end: Date, goal?: string) {
  const e = env();
  const res = await call<{ id: number }>("/rest/agile/1.0/sprint", { method: "POST", body: JSON.stringify({ name, originBoardId: Number(e.board), startDate: start.toISOString(), endDate: end.toISOString(), goal }) });
  return String(res.id);
}
export async function moveToSprint(sprintId: string, keys: string[]) {
  for (let i = 0; i < keys.length; i += 50)
    await call(`/rest/agile/1.0/sprint/${sprintId}/issue`, { method: "POST", body: JSON.stringify({ issues: keys.slice(i, i + 50) }) });
}
export async function startSprint(sprintId: string, start: Date, end: Date) {
  await call(`/rest/agile/1.0/sprint/${sprintId}`, { method: "POST", body: JSON.stringify({ state: "active", startDate: start.toISOString(), endDate: end.toISOString() }) });
}
export async function closeSprint(sprintId: string) {
  await call(`/rest/agile/1.0/sprint/${sprintId}`, { method: "POST", body: JSON.stringify({ state: "closed" }) });
}
