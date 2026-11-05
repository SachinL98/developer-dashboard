import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { dropConnection, type Provider } from "@/lib/integrations/connections";
import { appUrl } from "@/lib/auth/oauth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(appUrl(req)).origin) return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
  const me = await currentUser();
  if (!me) return NextResponse.redirect(new URL("/login", appUrl(req)), 303);
  const provider = (await req.formData()).get("provider");
  if (provider === "GOOGLE" || provider === "JIRA") await dropConnection(me.id, provider as Provider);
  return NextResponse.redirect(new URL("/settings", appUrl(req)), 303);
}
