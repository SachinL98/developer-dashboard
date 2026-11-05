import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioUnsupported, nameSpeakers, segmentsToText, transcribeAudio } from "../src/lib/stt";
import type { AiKey } from "../src/lib/ai";

const clip = { data: Buffer.from("fake-audio"), mime: "audio/webm;codecs=opus" };
const openai: AiKey = { key: "sk-o", provider: "openai", model: "gpt-4o", source: "user" };
const gemini: AiKey = { key: "AIza", provider: "gemini", model: "gemini-2.0-flash", source: "user" };
const claude: AiKey = { key: "sk-ant-x", provider: "anthropic", model: "c", source: "user" };
afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

describe("transcribeAudio", () => {
  it("openai: asks for diarized output and offsets the timestamps", async () => {
    const f = vi.fn().mockResolvedValue(json({ segments: [{ speaker: "A", start: 0, end: 4, text: "Morning all." }, { speaker: "B", start: 4.5, end: 8, text: "Hi." }] }));
    vi.stubGlobal("fetch", f);
    const segs = await transcribeAudio(openai, clip, { attendees: [], offsetSec: 120 });
    expect(segs).toEqual([{ speaker: "Speaker A", text: "Morning all.", start: 120, end: 124 }, { speaker: "Speaker B", text: "Hi.", start: 124.5, end: 128 }]);
    const [url, init] = f.mock.calls[0] as [string, any];
    expect(url).toMatch(/\/v1\/audio\/transcriptions$/);
    expect(init.headers.Authorization).toBe("Bearer sk-o");
    expect((init.body as FormData).get("model")).toBe("gpt-4o-transcribe-diarize");
    expect((init.body as FormData).get("response_format")).toBe("diarized_json");
  });
  it("openai: falls back to plain transcription when the diarizing model is unavailable", async () => {
    const f = vi.fn().mockResolvedValueOnce(json({ error: "model_not_found" }, 404)).mockResolvedValueOnce(json({ segments: [{ start: 0, end: 3, text: "Hello" }] }));
    vi.stubGlobal("fetch", f);
    const segs = await transcribeAudio(openai, clip, { attendees: [], offsetSec: 0 });
    expect((f.mock.calls[1][1] as any).body.get("model")).toBe("whisper-1");
    expect(segs[0]).toMatchObject({ speaker: "Speaker", text: "Hello" });
  });
  it("gemini: sends the audio inline with the attendee list and reads the function call", async () => {
    const f = vi.fn().mockResolvedValue(json({ candidates: [{ content: { parts: [{ functionCall: { name: "submit_transcript", args: { segments: [{ speaker: "Amaya Perera", start: 1, end: 5, text: "Let's start." }] } } }] } }] }));
    vi.stubGlobal("fetch", f);
    const segs = await transcribeAudio(gemini, clip, { attendees: ["Amaya Perera", "Nuwan Silva"], offsetSec: 60, recent: "Nuwan Silva: hi" });
    expect(segs).toEqual([{ speaker: "Amaya Perera", text: "Let's start.", start: 61, end: 65 }]);
    const body = JSON.parse((f.mock.calls[0][1] as any).body);
    const parts = body.contents[0].parts;
    expect(parts[0].text).toContain("Attendees: Amaya Perera, Nuwan Silva");
    expect(parts[1].inline_data).toMatchObject({ mime_type: "audio/webm", data: Buffer.from("fake-audio").toString("base64") });
  });
  it("claude cannot listen: says so clearly", async () => { await expect(transcribeAudio(claude, clip, { attendees: [], offsetSec: 0 })).rejects.toThrow(AudioUnsupported); });
  it("explains a rejected key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 401)));
    await expect(transcribeAudio(gemini, clip, { attendees: [], offsetSec: 0 })).rejects.toThrow(/Gemini.*Settings/);
  });
});

describe("nameSpeakers", () => {
  const segs = [{ speaker: "Speaker A", text: "Nuwan, can you take the migration?", start: 0 }, { speaker: "Speaker B", text: "Sure, I will do it tomorrow.", start: 5 }];
  const reply = (speakers: unknown[]) => vi.fn().mockResolvedValue(json({ model: "m", choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify({ speakers }) } }] } }] }));
  it("replaces labels with attendee names when the model is confident", async () => {
    vi.stubGlobal("fetch", reply([{ label: "Speaker B", name: "Nuwan Silva", confidence: 0.9 }, { label: "Speaker A", name: "Amaya Perera", confidence: 0.4 }]));
    const out = await nameSpeakers(openai, segs, ["Amaya Perera", "Nuwan Silva"]);
    expect(out.map((s) => s.speaker)).toEqual(["Speaker A", "Nuwan Silva"]);
  });
  it("never applies a name that is not in the attendee list", async () => {
    vi.stubGlobal("fetch", reply([{ label: "Speaker A", name: "Bob Invented", confidence: 1 }]));
    expect((await nameSpeakers(openai, segs, ["Amaya Perera"]))[0].speaker).toBe("Speaker A");
  });
  it("keeps the transcript if the naming call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 500)));
    expect(await nameSpeakers(openai, segs, ["Amaya Perera"])).toEqual(segs);
  });
  it("skips the call when nobody needs naming", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    await nameSpeakers(openai, [{ speaker: "Amaya Perera", text: "hi" }], ["Amaya Perera"]);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("segmentsToText", () => {
  it("writes lines the transcript parser understands", () => { expect(segmentsToText([{ speaker: "Amaya", text: "Hello", start: 75 }])).toBe("[00:01:15] Amaya: Hello"); });
});
