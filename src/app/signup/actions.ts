"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { LoginError } from "@/lib/auth/identity";
import { submitSignup } from "@/lib/auth/signup";

export interface SignupState { error: string | null; done?: string }

export async function signupAction(_prev: SignupState, form: FormData): Promise<SignupState> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
  const g = (k: string) => String(form.get(k) ?? "");
  try {
    const done = await submitSignup({ name: g("name"), email: g("email"), jobTitle: g("jobTitle") || undefined, githubLogin: g("githubLogin") || undefined, password: g("password"), confirm: g("confirm") }, ip);
    return { error: null, done };
  } catch (e) {
    if (e instanceof LoginError) return { error: e.message };
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Check the details and try again." };
    console.error("[signup]", e instanceof Error ? e.message : e);
    return { error: "Could not send your request right now. Please try again." };
  }
}
