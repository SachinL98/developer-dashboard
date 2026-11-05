import { allowedDomain, emailAllowed } from "../permissions";

export interface GoogleClaims { iss?: string; aud?: string; exp?: number; sub?: string; email?: string; email_verified?: boolean; hd?: string; name?: string; picture?: string }

export class LoginError extends Error {}

export function decodeJwtPayload(jwt: string): GoogleClaims {
  const part = jwt.split(".")[1];
  if (!part) throw new LoginError("Malformed ID token");
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

/**
 * Claim checks for an ID token received straight from Google's token endpoint over TLS
 * (per OIDC, signature verification is optional in that case; issuer/audience/expiry/domain are not).
 */
export function validateClaims(c: GoogleClaims, clientId: string, now = Date.now()) {
  if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") throw new LoginError("Unexpected token issuer");
  if (c.aud !== clientId) throw new LoginError("Token was not issued for this app");
  if (!c.exp || c.exp * 1000 < now) throw new LoginError("Sign-in token expired");
  if (!c.sub || !c.email) throw new LoginError("Google did not return an email address");
  if (!c.email_verified) throw new LoginError("Your Google email is not verified");
  if (!emailAllowed(c.email) || (c.hd && c.hd.toLowerCase() !== allowedDomain())) throw new LoginError(`Sign in with your @${allowedDomain()} account`);
  return { sub: c.sub, email: c.email.toLowerCase(), name: c.name || c.email.split("@")[0], picture: c.picture };
}
