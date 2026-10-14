import { NextResponse } from "next/server";
import { appUrl, finishTx } from "@/lib/auth/oauth";
import { LoginError, decodeJwtPayload, provisionUser, validateClaims } from "@/lib/auth/identity";
import { createSession, currentUser } from "@/lib/auth/session";
import { GOOGLE_TOKEN_URL, saveConnection, type TokenSet } from "@/lib/integrations/connections";
import { GOOGLE_WORK_SCOPES } from "@/lib/auth/scopes";
import { request } from "@/lib/integrations/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const base = appUrl(req);
  const u = new URL(req.url);
  const fail = (to: string, e: string) => NextResponse.redirect(`${base}${to}?error=${encodeURIComponent(e)}`);
  const tx = await finishTx("google", u.searchParams.get("state"));
  if (!tx) return fail("/login", "State check failed. Please try again.");
  const back = tx.mode === "connect" ? "/settings" : "/login";
  if (u.searchParams.get("error")) return fail(back, u.searchParams.get("error") === "access_denied" ? "Sign-in was cancelled." : "Google sign-in failed.");
  const code = u.searchParams.get("code");
  if (!code) return fail(back, "Missing authorisation code.");

  try {
    const t = await request<TokenSet & { id_token?: string }>("Google", GOOGLE_TOKEN_URL, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${base}/api/auth/google/callback`, grant_type: "authorization_code", code_verifier: tx.verifier,
      }),
    });
    if (!t.id_token) throw new LoginError("Google did not return an identity token");
    const who = validateClaims(decodeJwtPayload(t.id_token), process.env.GOOGLE_CLIENT_ID!);

    if (tx.mode === "connect") {
      const me = await currentUser();
      if (!me) return fail("/login", "Sign in first.");
      if (me.email !== who.email) throw new LoginError(`Connect the Google account ${me.email}, not ${who.email}.`);
      const granted = (t.scope ?? "").split(" ");
      if (!GOOGLE_WORK_SCOPES.every((s) => granted.includes(s))) throw new LoginError("Calendar and Meet access were not all granted. Tick every permission on the consent screen.");
      await saveConnection(me.id, "GOOGLE", t, { externalId: who.sub });
      return NextResponse.redirect(`${base}/settings?connected=google`);
    }

    const user = await provisionUser(who);
    await createSession(user.id);
    return NextResponse.redirect(`${base}${tx.next}`);
  } catch (e) {
    return fail(back, e instanceof LoginError ? e.message : "Google sign-in failed. Try again, or contact an admin if it keeps happening.");
  }
}
