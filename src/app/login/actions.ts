"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { demoMode } from "@/lib/auth/oauth";

/** Demo-only sign-in (no Google configured). Hard-refused when demo mode is off. */
export async function demoLoginAction(userId: string, next: string) {
  if (!demoMode()) throw new Error("Demo sign-in is disabled");
  const user = await db.developer.findUnique({ where: { id: userId } });
  if (!user || !user.active) throw new Error("Unknown user");
  await db.developer.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
