import { z } from "zod";
import { db } from "../db";
import { getWorkspace } from "../config";
import { isValidEmail } from "../permissions";
import { rateLimitShared, RateLimited } from "../rate-limit";
import { hashPassword, passwordProblem } from "./password";
import { LoginError } from "./identity";
import { reconcileJiraPeople } from "../jira-people";
import { hrOwnsIdentity } from "../hr-identity";

export const MAX_PENDING = 100;
export const REQUEST_TTL_DAYS = 14;

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(120),
  jobTitle: z.string().trim().max(60).optional().default("Developer"),
  githubLogin: z.string().trim().max(39).regex(/^[A-Za-z0-9-]*$/, "GitHub usernames use letters, numbers and dashes.").optional(),
  password: z.string().max(500),
  confirm: z.string().max(500),
});
export type SignupInput = z.input<typeof signupSchema>;

export const SIGNUP_DONE = "Request received. An admin will review it, and you can sign in once it is approved.";

export const signupEnabled = () => process.env.SIGNUP_ENABLED !== "false" && !hrOwnsIdentity();

/**
 * Self-service sign-up. The email can't be verified (no mail service), so nothing is created until an admin approves.
 * The answer is identical whether or not the email is already known, so nobody can use this form to find out who has an account.
 */
export async function submitSignup(input: SignupInput, ip: string): Promise<string> {
  if (!signupEnabled()) throw new LoginError(hrOwnsIdentity() ? "Accounts are created in the HR app. Ask your HR admin to invite you, then sign in here with the same email and password." : "Sign-up is closed. Ask an admin to add you.");
  try { await rateLimitShared(`signup-ip:${ip}`, 5, 60 * 60_000); } catch (e) { if (e instanceof RateLimited) throw new LoginError("Too many requests from this network. Try again later."); throw e; }
  const p = signupSchema.parse(input);
  if (!isValidEmail(p.email)) throw new LoginError("Enter a valid email address.");
  if (p.password !== p.confirm) throw new LoginError("The two passwords do not match.");
  const bad = passwordProblem(p.password, { email: p.email, name: p.name });
  if (bad) throw new LoginError(bad);

  // Someone who already has a working account gets the same answer and nothing happens. A person who only exists from the Jira sync (no password yet) may register.
  const known = await db.developer.findUnique({ where: { email: p.email }, select: { passwordHash: true } });
  if (known?.passwordHash) return SIGNUP_DONE;
  if ((await db.signupRequest.count()) >= MAX_PENDING) throw new LoginError("Too many requests are waiting. Ask an admin to review them.");
  const data = { name: p.name, jobTitle: p.jobTitle || "Developer", githubLogin: p.githubLogin || null, passwordHash: await hashPassword(p.password) };
  await db.signupRequest.upsert({ where: { email: p.email }, update: { ...data, createdAt: new Date() }, create: { email: p.email, ...data } });
  return SIGNUP_DONE;
}

export const pruneSignupRequests = () => db.signupRequest.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - REQUEST_TTL_DAYS * 86_400_000) } } });

/** Admin approves: the account is created with the password the person chose. A person already imported from Jira is linked instead of duplicated. */
export async function approveSignup(requestId: string, access: "DEVELOPER" | "LEAD" | "ADMIN") {
  const r = await db.signupRequest.findUnique({ where: { id: requestId } });
  if (!r) throw new Error("That request no longer exists.");
  const existing = await db.developer.findUnique({ where: { email: r.email } });
  if (existing?.passwordHash) { await db.signupRequest.delete({ where: { id: r.id } }); throw new Error("That person already has an account."); }
  const github = r.githubLogin && !(await db.developer.findFirst({ where: { githubLogin: r.githubLogin, ...(existing ? { id: { not: existing.id } } : {}) }, select: { id: true } })) ? r.githubLogin : null;
  const common = { name: r.name, role: r.jobTitle, githubLogin: github, access, passwordHash: r.passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), active: true };
  const user = existing
    ? await db.developer.update({ where: { id: existing.id }, data: common }) // keeps their Jira link and every ticket already assigned to them
    : await db.developer.create({ data: { email: r.email, ...common, capacityHrs: (await getWorkspace()).defaultCapacityHrs, avatarHue: Math.floor(Math.random() * 360) } });
  await db.signupRequest.delete({ where: { id: r.id } });
  await reconcileJiraPeople().catch(() => {}); // a Jira-imported entry under the same full name is the same person
  return user;
}
