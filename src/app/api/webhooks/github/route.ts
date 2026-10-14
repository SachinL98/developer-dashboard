import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { ticketKeyFrom } from "@/lib/integrations/github";
import { after } from "next/server";
import * as svc from "@/lib/services";
import { getReviewConfig } from "@/lib/review-config";

export const dynamic = "force-dynamic";

function verify(body: string, sig: string | null) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // unsigned only in local dev; production requires GITHUB_WEBHOOK_SECRET
  if (!sig) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/** GitHub `pull_request` events keep PR link/state on tickets current. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verify(raw, req.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  if (req.headers.get("x-github-event") !== "pull_request") return NextResponse.json({ ok: true, ignored: true });
  const { pull_request: pr, action } = JSON.parse(raw);
  const key = ticketKeyFrom(`${pr.title} ${pr.head?.ref ?? ""}`);
  if (!key) return NextResponse.json({ ok: true, linked: false });
  const t = await db.ticket.findUnique({ where: { key } });
  if (!t) return NextResponse.json({ ok: true, linked: false });
  await db.ticket.update({ where: { id: t.id }, data: { prUrl: pr.html_url, prNumber: pr.number, prState: pr.merged ? "merged" : pr.state } });
  // New commits on a PR that is waiting in Initial Review re-run the Claude review (fix, push, re-check).
  let rerun = false;
  if (t.status === "INITIAL_REVIEW" && ["synchronize", "reopened", "ready_for_review"].includes(action) && (await getReviewConfig()).autoRun) {
    const last = await db.prReview.findFirst({ where: { ticketId: t.id, kind: "INITIAL_CLAUDE" }, orderBy: { createdAt: "desc" } });
    if (!last || Date.now() - last.createdAt.getTime() > 30_000) { rerun = true; after(async () => { await svc.runInitialReview(t.id, "push").catch(() => {}); }); }
  }
  return NextResponse.json({ ok: true, linked: true, key, rerun });
}
