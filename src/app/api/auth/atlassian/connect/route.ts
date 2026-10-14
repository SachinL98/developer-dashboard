import { NextResponse } from "next/server";
import { appUrl, atlassianConfigured, beginTx } from "@/lib/auth/oauth";
import { currentUser } from "@/lib/auth/session";
import { ATLASSIAN_SCOPES } from "@/lib/auth/scopes";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", appUrl(req)));
  if (!atlassianConfigured()) return NextResponse.redirect(new URL("/settings?error=atlassian_not_configured", appUrl(req)));
  const { tx } = await beginTx("atlassian", "connect", "/settings");
  const q = new URLSearchParams({
    audience: "api.atlassian.com", client_id: process.env.ATLASSIAN_CLIENT_ID!, scope: ATLASSIAN_SCOPES.join(" "),
    redirect_uri: `${appUrl(req)}/api/auth/atlassian/callback`, state: tx.state, response_type: "code", prompt: "consent",
  });
  return NextResponse.redirect(`https://auth.atlassian.com/authorize?${q}`);
}
