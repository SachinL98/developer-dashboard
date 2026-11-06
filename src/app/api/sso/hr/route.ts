import { currentUser } from "@/lib/auth/session";
import { hrWebUrl, signSso, ssoSecret } from "@/lib/sso";

/** Sends the signed-in person to the HR app with a signed one-minute token, so they do not sign in again. */
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return Response.redirect(new URL("/login", req.url), 303);
  const base = hrWebUrl(), secret = ssoSecret();
  if (!base || !secret) return Response.redirect(new URL("/", req.url), 303);
  return Response.redirect(`${base}/api/sso?token=${encodeURIComponent(signSso(me.email, "hr", secret))}`, 303);
}
