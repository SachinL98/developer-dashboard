import { NextResponse } from "next/server";
import { appUrl, beginTx, googleLoginConfigured } from "@/lib/auth/oauth";
import { currentUser } from "@/lib/auth/session";
import { allowedDomain } from "@/lib/permissions";
import { GOOGLE_LOGIN_SCOPES, GOOGLE_WORK_SCOPES } from "@/lib/auth/scopes";

export const dynamic = "force-dynamic";

/** Grants Calendar + Meet access to the signed-in user (offline, so tokens can be refreshed). */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", appUrl(req)));
  if (!googleLoginConfigured()) return NextResponse.redirect(new URL("/settings?error=google_not_configured", appUrl(req)));
  const { tx, challenge } = await beginTx("google", "connect", "/settings");
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: `${appUrl(req)}/api/auth/google/callback`, response_type: "code",
    scope: [...GOOGLE_LOGIN_SCOPES, ...GOOGLE_WORK_SCOPES].join(" "), state: tx.state, code_challenge: challenge, code_challenge_method: "S256",
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", hd: allowedDomain(), login_hint: user.email,
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
}
