"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser, revokeSessions } from "@/lib/auth/session";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { rateLimitShared } from "@/lib/rate-limit";
import { userMessage } from "@/lib/safe-error";

export interface PasswordState { error: string | null; done?: boolean }

/** Change the signed-in user's own password. Requires the current one; signs out all other devices. */
export async function changePasswordAction(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  try {
    const user = await currentUser();
    if (!user) return { error: "Your session has expired. Sign in again." };
    if (user.hrManaged) return { error: "Your password is managed in the HR app. Change it there (account menu, My account), and it applies here too." };
    await rateLimitShared(`pw-change:${user.id}`, 10, 10 * 60_000);
    const current = z.string().max(500).parse(String(form.get("current") ?? ""));
    const next = z.string().max(500).parse(String(form.get("next") ?? ""));
    const confirm = String(form.get("confirm") ?? "");
    if (!user.passwordHash || !(await verifyPassword(current, user.passwordHash))) return { error: "Your current password is not correct." };
    if (next !== confirm) return { error: "The two new passwords do not match." };
    if (next === current) return { error: "Choose a password you have not used just now." };
    const bad = passwordProblem(next, { email: user.email, name: user.name });
    if (bad) return { error: bad };
    await db.developer.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false, passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null } });
    await revokeSessions(user.id, true);
  } catch (e) { return { error: e instanceof z.ZodError ? "Invalid input." : userMessage(e) }; }
  if (form.get("redirect") === "1") redirect("/");
  return { error: null, done: true };
}
