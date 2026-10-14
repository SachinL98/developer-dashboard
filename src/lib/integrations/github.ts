import { request, IntegrationError } from "./http";

export const githubConfigured = () => !!process.env.GITHUB_TOKEN;
const call = <T>(path: string, init: RequestInit = {}, accept = "application/vnd.github+json") => {
  if (!githubConfigured()) throw new IntegrationError("GitHub", "not configured (set GITHUB_TOKEN, GITHUB_ORG)");
  return request<T>("GitHub", `https://api.github.com${path}`, {
    ...init, headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: accept, "X-GitHub-Api-Version": "2022-11-28", ...(init.headers ?? {}) },
  });
};

export const listOrgRepos = () => call<{ full_name: string; name: string; html_url: string; pushed_at: string; open_issues_count: number }[]>(`/orgs/${process.env.GITHUB_ORG}/repos?per_page=100&sort=pushed`);

export interface PrSummary { number: number; title: string; url: string; state: "open" | "merged" | "closed"; draft: boolean; author: string; branch: string; base: string; updatedAt: string; additions?: number; deletions?: number }
export async function listPullRequests(repo: string, state: "open" | "closed" | "all" = "all"): Promise<PrSummary[]> {
  const prs = await call<any[]>(`/repos/${repo}/pulls?state=${state}&per_page=100&sort=updated&direction=desc`);
  return prs.map((p) => ({
    number: p.number, title: p.title, url: p.html_url, draft: p.draft, author: p.user?.login, branch: p.head?.ref, base: p.base?.ref,
    state: p.merged_at ? "merged" : p.state, updatedAt: p.updated_at,
  }));
}
export async function getPullRequest(repo: string, n: number) {
  const p = await call<any>(`/repos/${repo}/pulls/${n}`);
  return { number: p.number, title: p.title, url: p.html_url, state: (p.merged ? "merged" : p.state) as PrSummary["state"], additions: p.additions, deletions: p.deletions, changedFiles: p.changed_files, base: p.base?.ref, head: p.head?.ref };
}
export async function getPullDiff(repo: string, n: number): Promise<string> {
  if (!githubConfigured()) throw new IntegrationError("GitHub", "not configured (set GITHUB_TOKEN, GITHUB_ORG)");
  const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${n}`, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github.diff", "X-GitHub-Api-Version": "2022-11-28" }, cache: "no-store",
  });
  if (!res.ok) throw new IntegrationError("GitHub", `${res.status} ${(await res.text()).slice(0, 200)}`, res.status);
  return res.text();
}
export const listPullReviews = (repo: string, n: number) => call<{ user: { login: string }; state: string; submitted_at: string }[]>(`/repos/${repo}/pulls/${n}/reviews`);

export function parsePrUrl(url: string) {
  const m = url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  return m ? { repo: m[1], number: Number(m[2]) } : null;
}
export const ticketKeyFrom = (text: string) => text.match(/\b([A-Z][A-Z0-9]{1,9}-\d+)\b/)?.[1] ?? null;
