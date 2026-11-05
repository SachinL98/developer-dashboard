import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth/session";
import { aiKeyFor } from "@/lib/ai";
import { AudioUnsupported, mergeStreams, nameSpeakers, segmentsToText, transcribeAudio } from "@/lib/stt";
import { rateLimit, RateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 3_500_000; // stays under the 4.5 MB request limit of serverless functions; the recorder sends short clips

/** One short recording clip in, transcribed lines with speaker names out. The browser stitches the clips together. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  try { rateLimit(`audio:${user.id}`, 240, 3_600_000); } catch (e) { if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 }); throw e; }
  const { id } = await ctx.params;
  const meeting = await db.meeting.findUnique({ where: { id }, select: { id: true, attendees: true } });
  if (!meeting) return NextResponse.json({ ok: false, error: "Meeting not found." }, { status: 404 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Could not read the recording." }, { status: 400 }); }
  const file = form.get("audio");
  const micFile = form.get("mic"); // optional: the signed-in person's own microphone, recorded separately from the shared tab
  if (!(file instanceof File) || !file.size) return NextResponse.json({ ok: false, error: "No audio received." }, { status: 400 });
  const mic = micFile instanceof File && micFile.size ? micFile : null;
  if (file.size + (mic?.size ?? 0) > MAX_BYTES) return NextResponse.json({ ok: false, error: "That clip is too large. Record in shorter clips." }, { status: 413 });
  const mime = file.type || "audio/webm";
  if (!/^(audio|video)\//.test(mime) || (mic && !/^(audio|video)\//.test(mic.type || "audio/webm"))) return NextResponse.json({ ok: false, error: "That is not an audio file." }, { status: 415 });
  const offsetSec = Math.min(Math.max(Number(form.get("offset") ?? 0) || 0, 0), 6 * 3600);
  const recent = String(form.get("recent") ?? "").slice(-2000);

  const ai = await aiKeyFor(user.id, { audio: true });
  if (!ai) return NextResponse.json({ ok: false, error: new AudioUnsupported().message }, { status: 400 });
  const people = (await db.developer.findMany({ where: { active: true }, select: { name: true } })).map((p) => p.name);
  const attendees = [...new Set([...meeting.attendees.filter((a) => !a.includes("@")), ...people])];
  try {
    const tctx = { attendees, offsetSec, recent };
    // With a separate microphone recording we know exactly who is speaking on it: the signed-in person. Everyone else is on the shared tab.
    const [others, self] = await Promise.all([
      transcribeAudio(ai, { data: Buffer.from(await file.arrayBuffer()), mime }, tctx),
      mic ? transcribeAudio(ai, { data: Buffer.from(await mic.arrayBuffer()), mime: mic.type || "audio/webm" }, tctx, { single: user.name }) : Promise.resolve([]),
    ]);
    let segs = mic ? mergeStreams(self, others) : others;
    segs = await nameSpeakers(ai, segs.map((x) => x), attendees.filter((a) => a !== user.name || !mic), recent);
    return NextResponse.json({ ok: true, text: segmentsToText(segs), segments: segs.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 240) : "Transcription failed." }, { status: e instanceof AudioUnsupported ? 400 : 502 });
  }
}
