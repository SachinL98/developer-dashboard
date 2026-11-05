"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/oauth";
import { LoginError } from "@/lib/auth/identity";
import { verifyLogin } from "@/lib/auth/login";

export interface LoginState { error: string | null }

/** Email + password sign-in. */
export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? "/"));
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
  let mustChange = false;
  try {
    const user = await verifyLogin(email, password, ip);
    await createSession(user.id);
    mustChange = user.mustChangePassword;
  } catch (e) {
    if (e instanceof LoginError) return { error: e.message };
    console.error("[login]", e instanceof Error ? e.message : e);
    return { error: "Could not sign in right now. Please try again." };
  }
  redirect(mustChange ? "/change-password" : next);
}

/** Development only: seeded-user picker. Never available in production. */
export async function demoLoginAction(userId: string, next: string) {
  if (process.env.NODE_ENV === "production") throw new Error("Demo sign-in is disabled");
  const user = await db.developer.findUnique({ where: { id: userId } });
  if (!user || !user.active) throw new Error("Unknown user");
  await db.developer.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
