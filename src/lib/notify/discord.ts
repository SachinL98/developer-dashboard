/**
 * Discord messages. Two ways, both optional:
 *   DISCORD_BOT_TOKEN       a bot in your server: sends each person a direct message (they need their Discord user id saved in Settings)
 *   DISCORD_WEBHOOK_URL     a channel webhook: posts in that channel and @mentions the person when their id is known
 * A direct message is preferred when the bot token and the person's id are both there.
 */
const API = () => (process.env.DISCORD_API_URL || "https://discord.com/api/v10").replace(/\/$/, "");

export type DiscordRoute = "dm" | "webhook" | null;
export const discordRoute = (hasUserId: boolean, env: NodeJS.ProcessEnv = process.env): DiscordRoute => (env.DISCORD_BOT_TOKEN && hasUserId ? "dm" : env.DISCORD_WEBHOOK_URL ? "webhook" : null);
export const discordConfigured = (env: NodeJS.ProcessEnv = process.env) => !!(env.DISCORD_BOT_TOKEN || env.DISCORD_WEBHOOK_URL);
export const validDiscordId = (s: string) => /^\d{15,25}$/.test(s.trim());

const post = async (url: string, init: RequestInit, label: string) => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) throw new Error(`Discord ${label} ${res.status}: ${(await res.text()).slice(0, 140)}`);
  return res;
};

export async function sendDiscord(p: { userId?: string | null; content: string }): Promise<{ route: "dm" | "webhook" }> {
  const route = discordRoute(!!p.userId);
  const content = p.content.slice(0, 1900);
  if (route === "dm") {
    const auth = { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "content-type": "application/json" };
    const ch: any = await (await post(`${API()}/users/@me/channels`, { method: "POST", headers: auth, body: JSON.stringify({ recipient_id: p.userId }) }, "open DM")).json();
    await post(`${API()}/channels/${ch.id}/messages`, { method: "POST", headers: auth, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) }, "send DM");
    return { route };
  }
  if (route === "webhook") {
    await post(process.env.DISCORD_WEBHOOK_URL!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: p.userId ? `<@${p.userId}> ${content}` : content, allowed_mentions: p.userId ? { users: [p.userId] } : { parse: [] } }) }, "webhook");
    return { route };
  }
  throw new Error("Discord is not set up (DISCORD_BOT_TOKEN or DISCORD_WEBHOOK_URL).");
}
