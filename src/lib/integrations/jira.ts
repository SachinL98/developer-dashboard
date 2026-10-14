import { request, IntegrationError } from "./http";
import type { StatusKey } from "../workflow";
import { STATUS_META } from "../workflow";

import { boundUserId } from "../context";
import { getSetting, setSetting } from "../settings";
import { cachedWorkspace, getWorkspace } from "../config";
import { accessTokenFor, getConnection } from "./connections";

const env = () => ({
  base: process.env.JIRA_BASE_URL?.replace(/\/$/, ""), email: process.env.JIRA_EMAIL, token: process.env.JIRA_API_TOKEN,
  // Project, board and field ids come from the admin-set workspace config (env vars are the defaults).
  project: cachedWorkspace().jira.projectKey || undefined, board: cachedWorkspace().jira.boardId || undefined,
  spField: cachedWorkspace().jira.storyPointsField, sprintField: cachedWorkspace().jira.sprintField,
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
  await getWorkspace();
  if (!env().project) return false;
  try { await resolveAuth(); return true; } catch { return false; }
}
export const jiraProjectConfigured = () => !!env().project;

const call = async <T>(path: string, init: RequestInit = {}) => {
  await getWorkspace();
  const auth = await resolveAuth();
  return request<T>("Jira", `${auth.base}${path}`, { ...init, headers: { ...auth.headers, "Content-Type": "application/json", ...(init.headers ?? {}) } });
};

/** Link to an issue in the Jira UI for the current user's site. */
export async function jiraBrowseUrl(key: string): Promise<string | null> {
  try { return `${(await resolveAuth()).siteUrl}/browse/${key}`; } catch { return null; }
}

const adf = (text: string) => ({ type: "doc", version: 1, content: text.split("\n").map((l) => ({ type: "paragraph", content: l ? [{ type: "text", text: l }] : [] })) });
const adfText = (n: any): string => !n ? "" : n.text ?? (n.content ?? []).map(adfText).join(n.type === "doc" ? "\n" : "");

export type StatusMap = Record<string, StatusKey | "">;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/**
 * Map a Jira status to a workflow column. Order: an admin's explicit mapping, then the status name, then Jira's own
 * status category (To Do → Backlog, In Progress → In Progress, Done → Done).
 */
export function statusFromJira(name: string, overrides: StatusMap = {}, category?: string): StatusKey | null {
  const ov = Object.entries(overrides).find(([k]) => norm(k) === norm(name))?.[1];
  if (ov) return ov;
  const hit = (Object.keys(STATUS_META) as StatusKey[]).find((k) => norm(STATUS_META[k].label) === norm(name));
  if (hit) return hit;
  const n = norm(name);
  if (n.includes("stag") && n.includes("fail")) return "FAILED_STG";
  if (n.includes("stg") || n.includes("staging")) return "DEPLOYED_STG";
  if (n.includes("prod")) return "DEPLOYED_PROD";
  if (n === "todo" || n === "open" || n === "backlog") return "BACKLOG";
  if (n === "selectedfordevelopment" || n === "ready") return "READY_TO_DEV";
  if (n === "inprogress") return "IN_PROGRESS";
  if (n === "inreview" || n === "codereview" || n === "peerreview") return "REVIEW";
  if (n === "done" || n === "closed" || n === "resolved") return "DONE";
  if (category === "new") return "BACKLOG";
  if (category === "indeterminate") return "IN_PROGRESS";
  if (category === "done") return "DONE";
  return null;
}

let mapCache: { at: number; map: StatusMap } | null = null;
/** The admin-edited Jira status → workflow column mapping (cached briefly). */
export async function loadStatusMap(): Promise<StatusMap> {
  if (mapCache && Date.now() - mapCache.at < 15_000) return mapCache.map;
  const map = (await getSetting<StatusMap>("jira.statusMap").catch(() => null)) ?? {};
  mapCache = { at: Date.now(), map };
  return map;
}
export async function saveStatusMap(map: StatusMap) { await setSetting("jira.statusMap", map); mapCache = null; }

export interface JiraIssue {
  key: string; title: string; description: string; type: string; priority: string; status: string; statusCategory?: string; points: number | null;
  assigneeEmail?: string; assigneeId?: string; sprintId?: string; sprintName?: string; labels: string[]; estimateHrs: number | null; updated?: string;
}

/** The sprint field is an array of every sprint the issue has been in: prefer the active one, else the newest. */
function pickSprint(v: any): { sprintId?: string; sprintName?: string } {
  const list: any[] = Array.isArray(v) ? v : v ? [v] : [];
  const s = list.find((x) => x.state === "active") ?? list.filter((x) => x.state !== "closed").pop() ?? undefined;
  return s ? { sprintId: String(s.id), sprintName: s.name } : {};
}

const mapType = (t: string) => (/bug/i.test(t) ? "BUG" : /story|feature|epic/i.test(t) ? "FEATURE" : /improve|enhance/i.test(t) ? "ENHANCEMENT" : "TASK");
const mapPriority = (p?: string) => (/highest|blocker|critical/i.test(p ?? "") ? "CRITICAL" : /high/i.test(p ?? "") ? "HIGH" : /low/i.test(p ?? "") ? "LOW" : "MEDIUM");

/** Turn a Jira issue payload (search result or webhook body) into our shape. */
export function parseIssue(i: any): JiraIssue {
  const e = env();
  const f = i.fields ?? {};
  const pts = f[e.spField];
  return {
    key: i.key, title: f.summary ?? "", description: adfText(f.description), type: mapType(f.issuetype?.name ?? ""), priority: mapPriority(f.priority?.name),
    status: f.status?.name ?? "", statusCategory: f.status?.statusCategory?.key, points: typeof pts === "number" ? pts : null,
    assigneeEmail: f.assignee?.emailAddress, assigneeId: f.assignee?.accountId, ...pickSprint(f[e.sprintField]), labels: f.labels ?? [],
    estimateHrs: f.timeoriginalestimate ? f.timeoriginalestimate / 3600 : null, updated: f.updated,
  };
}

export async function searchIssues(jql?: string): Promise<JiraIssue[]> {
  const e = env();
  const query = jql ?? `project = ${e.project} AND (sprint in openSprints() OR sprint is EMPTY) ORDER BY Rank ASC`;
  const out: JiraIssue[] = [];
  let nextPageToken: string | undefined;
  do {
    const data: any = await call("/rest/api/3/search/jql", {
      method: "POST",
      body: JSON.stringify({ jql: query, maxResults: 100, nextPageToken, fields: ["summary", "description", "issuetype", "priority", "status", "assignee", "labels", "timeoriginalestimate", "updated", e.sprintField, e.spField] }),
    });
    for (const i of data.issues ?? []) out.push(parseIssue(i));
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);
  return out;
}

export async function createIssue(i: { title: string; description: string; type: string; priority: string; points?: number | null; labels?: string[]; estimateHrs?: number | null; assigneeAccountId?: string }) {
  const e = env();
  const typeName = { BUG: "Bug", FEATURE: "Story", ENHANCEMENT: "Improvement", TASK: "Task" }[i.type] ?? "Task";
  const priorityName = { CRITICAL: "Highest", HIGH: "High", MEDIUM: "Medium", LOW: "Low" }[i.priority] ?? "Medium";
  const fields: any = { project: { key: e.project }, summary: i.title, description: adf(i.description || i.title), issuetype: { name: typeName }, priority: { name: priorityName }, labels: i.labels ?? [] };
  const est = await estimationMode();
  if (est.mode === "points" && i.points != null) fields[est.field] = i.points;
  if (est.mode === "hours" && i.estimateHrs != null) fields.timetracking = { originalEstimate: `${Math.max(1, Math.round(i.estimateHrs * 60))}m` };
  if (i.assigneeAccountId) fields.assignee = { accountId: i.assigneeAccountId };
  const res = await call<{ key: string }>("/rest/api/3/issue", { method: "POST", body: JSON.stringify({ fields }) });
  return res.key;
}

// ---- Board columns + estimation field (read from the real board) ----
export interface BoardColumn { name: string; statuses: { id: string; name: string; category?: string }[] }
export interface EstimationInfo { mode: "points" | "hours"; field: string }
export interface JiraBoardInfo { boardId: string; boardName?: string; columns: BoardColumn[]; estimation: EstimationInfo; fetchedAt: string }

async function resolveBoardId(): Promise<string> {
  const e = env();
  if (e.board) return e.board;
  const data = await call<{ values: { id: number }[] }>(`/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(e.project ?? "")}&type=scrum`);
  if (!data.values?.[0]) throw new IntegrationError("Jira", "No scrum board found for the project — set JIRA_BOARD_ID");
  return String(data.values[0].id);
}

/**
 * Read the real board: its columns (each with the Jira statuses it contains) and how it estimates.
 * Estimation: a board estimating by "Original time estimate" uses hours; by the Story point field uses points.
 */
export async function fetchBoardInfo(): Promise<JiraBoardInfo> {
  const e = env();
  const boardId = await resolveBoardId();
  const [cfg, statuses] = await Promise.all([
    call<any>(`/rest/agile/1.0/board/${boardId}/configuration`),
    call<any[]>("/rest/api/3/status"),
  ]);
  const byId = new Map(statuses.map((s) => [String(s.id), { id: String(s.id), name: s.name as string, category: s.statusCategory?.key as string | undefined }]));
  const columns: BoardColumn[] = (cfg.columnConfig?.columns ?? []).map((c: any) => ({
    name: c.name, statuses: (c.statuses ?? []).map((s: any) => byId.get(String(s.id)) ?? { id: String(s.id), name: String(s.id) }),
  }));
  const field: string | undefined = cfg.estimation?.field?.fieldId;
  let estimation: EstimationInfo;
  if (field === "timeoriginalestimate" || field === "aggregatetimeoriginalestimate") estimation = { mode: "hours", field: "timeoriginalestimate" };
  else if (field) estimation = { mode: "points", field };
  else estimation = await guessEstimation();
  if (estimation.mode === "points" && field === undefined) estimation.field = e.spField;
  return { boardId, boardName: cfg.name, columns, estimation, fetchedAt: new Date().toISOString() };
}

/** Boards without an estimation statistic: look for a story-points field, else fall back to original estimate. */
async function guessEstimation(): Promise<EstimationInfo> {
  const e = env();
  try {
    const fields = await call<any[]>("/rest/api/3/field");
    const sp = fields.find((f) => f.id === e.spField) ?? fields.find((f) => /^story point/i.test(f.name));
    if (sp) return { mode: "points", field: sp.id };
  } catch { /* fall through */ }
  return { mode: "hours", field: "timeoriginalestimate" };
}

let infoCache: { at: number; info: JiraBoardInfo } | null = null;
export const resetBoardCache = () => { infoCache = null; };
/** The live board info (cached for a minute) — also persisted so pages can render the columns without a Jira call. */
export async function boardInfo(force = false): Promise<JiraBoardInfo> {
  if (!force && infoCache && Date.now() - infoCache.at < 60_000) return infoCache.info;
  const info = await fetchBoardInfo();
  infoCache = { at: Date.now(), info };
  await setSetting("jira.board", info).catch(() => {});
  return info;
}
export const cachedBoardInfo = () => getSetting<JiraBoardInfo>("jira.board");
export async function estimationMode(): Promise<EstimationInfo> {
  try { return (await boardInfo()).estimation; } catch { return (await cachedBoardInfo())?.estimation ?? guessEstimation(); }
}

/**
 * Write an estimate to the Jira issue in whatever unit the project uses (detected from the board).
 * Story-point projects get points; time-estimate projects get the original estimate. Throws on failure.
 */
export async function updateEstimate(key: string, v: { points?: number | null; hours?: number | null }) {
  const est = await estimationMode();
  const fields: any = {};
  let value: number;
  if (est.mode === "points") {
    if (v.points == null) throw new IntegrationError("Jira", "This project estimates in story points but the ticket has no points");
    fields[est.field] = value = v.points;
  } else {
    if (v.hours == null) throw new IntegrationError("Jira", "This project estimates in time but the ticket has no hours");
    fields.timetracking = { originalEstimate: `${Math.max(1, Math.round(v.hours * 60))}m` }; value = v.hours;
  }
  await call(`/rest/api/3/issue/${key}`, { method: "PUT", body: JSON.stringify({ fields }) });
  return { mode: est.mode, field: est.field, value };
}

/** Move an issue to the Jira status named like our column (transitions are looked up by target status). */
export async function transitionIssue(key: string, to: StatusKey) {
  const map = await loadStatusMap();
  const data = await call<{ transitions: { id: string; to: { name: string; statusCategory?: { key: string } } }[] }>(`/rest/api/3/issue/${key}/transitions`);
  const hit = data.transitions.find((t) => statusFromJira(t.to.name, map, t.to.statusCategory?.key) === to);
  if (!hit) throw new IntegrationError("Jira", `No transition from current status to "${STATUS_META[to].label}" on ${key}`);
  await call(`/rest/api/3/issue/${key}/transitions`, { method: "POST", body: JSON.stringify({ transition: { id: hit.id } }) });
  return hit.to.name;
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
