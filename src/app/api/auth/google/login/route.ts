import { NextResponse } from "next/server";
import { appUrl, beginTx, googleLoginConfigured } from "@/lib/auth/oauth";
import { allowedDomain } from "@/lib/permissions";
import { GOOGLE_LOGIN_SCOPES } from "@/lib/auth/scopes";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!googleLoginConfigured()) return NextResponse.redirect(new URL("/login?error=not_configured", appUrl(req)));
  const { tx, challenge } = await beginTx("google", "login", new URL(req.url).searchParams.get("next") ?? "/");
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: `${appUrl(req)}/api/auth/google/callback`, response_type: "code",
    scope: GOOGLE_LOGIN_SCOPES.join(" "), state: tx.state, code_challenge: challenge, code_challenge_method: "S256",
    hd: allowedDomain(), prompt: "select_account",
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
}
