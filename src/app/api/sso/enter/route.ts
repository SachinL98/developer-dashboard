import { db } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { linkToJiraOnSignIn } from "@/lib/jira-people";
import { hrOwnsIdentity, mirrorFromHr } from "@/lib/hr-identity";
import { ssoSecret, verifySso } from "@/lib/sso";

/** Landing spot for single sign-on from the HR app. Only people who already have an active account here can come in. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const login = Response.redirect(new URL("/login", url), 303);
  const secret = ssoSecret();
  const claims = secret ? verifySso(url.searchParams.get("token") ?? "", "dash", secret) : null;
  if (!claims) return login;
  // The HR app vouched for this person (signed token, name and job title included), so create or refresh their record here.
  const user = hrOwnsIdentity() && claims.name
    ? await mirrorFromHr({ email: claims.email, name: claims.name, firstName: "", lastName: "", role: claims.role ?? null })
    : await db.developer.findUnique({ where: { email: claims.email } });
  if (!user || !user.active || !user.passwordHash) return login;
  await createSession(user.id);
  await linkToJiraOnSignIn(user.id);
  await db.developer.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return Response.redirect(new URL("/", url), 303);
}
