import { NextResponse } from "next/server";
import { appUrl, finishTx } from "@/lib/auth/oauth";
import { currentUser } from "@/lib/auth/session";
import { ATLASSIAN_TOKEN_URL, saveConnection, type TokenSet } from "@/lib/integrations/connections";
import { request } from "@/lib/integrations/http";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Site { id: string; url: string; name: string }

export async function GET(req: Request) {
  const base = appUrl(req);
  const u = new URL(req.url);
  const fail = (e: string) => NextResponse.redirect(`${base}/settings?error=${encodeURIComponent(e)}`);
  const tx = await finishTx("atlassian", u.searchParams.get("state"));
  const me = await currentUser();
  if (!me) return NextResponse.redirect(`${base}/login`);
  if (!tx) return fail("State check failed. Please try again.");
  if (u.searchParams.get("error")) return fail("Jira connection was cancelled.");
  const code = u.searchParams.get("code");
  if (!code) return fail("Missing authorisation code.");
  try {
    const t = await request<TokenSet>("Jira", ATLASSIAN_TOKEN_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", client_id: process.env.ATLASSIAN_CLIENT_ID, client_secret: process.env.ATLASSIAN_CLIENT_SECRET, code, redirect_uri: `${base}/api/auth/atlassian/callback` }),
    });
    const auth = { Authorization: `Bearer ${t.access_token}` };
    const sites = await request<Site[]>("Jira", "https://api.atlassian.com/oauth/token/accessible-resources", { headers: auth });
    const wanted = process.env.JIRA_SITE_URL?.replace(/\/$/, "");
    const site = (wanted ? sites.find((s) => s.url === wanted) : sites[0]);
    if (!site) return fail(wanted ? `Your Atlassian account has no access to ${wanted}.` : "Your Atlassian account has no Jira site.");
    const profile = await request<{ account_id: string; email?: string }>("Jira", `https://api.atlassian.com/ex/jira/${site.id}/rest/api/3/myself`, { headers: auth }).catch(() => null);
    await saveConnection(me.id, "JIRA", t, { cloudId: site.id, siteUrl: site.url, externalId: profile?.account_id });
    if (profile?.account_id) await db.developer.update({ where: { id: me.id }, data: { jiraAccount: profile.account_id } }); // lets Jira assignees map to this user
    return NextResponse.redirect(`${base}/settings?connected=jira`);
  } catch (e) {
    return fail(e instanceof Error ? e.message.slice(0, 160) : "Jira connection failed.");
  }
}
