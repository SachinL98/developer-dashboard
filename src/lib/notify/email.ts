import nodemailer from "nodemailer";

/**
 * Outgoing email through ZeptoMail (transactional API) or Zoho Mail (SMTP). ZeptoMail is used when its token is set, otherwise Zoho SMTP.
 *   ZEPTOMAIL_TOKEN   the "Send Mail token" (with or without the "Zoho-enczapikey " prefix); ZEPTOMAIL_URL for other regions (https://api.zeptomail.eu, .in)
 *   ZOHO_SMTP_USER / ZOHO_SMTP_PASSWORD   mailbox and app password; ZOHO_SMTP_HOST (default smtp.zoho.com; smtp.zoho.eu, smtp.zoho.in) and ZOHO_SMTP_PORT (default 465)
 *   EMAIL_FROM (verified sender address) and EMAIL_FROM_NAME. EMAIL_PROVIDER=zeptomail|zoho forces a choice.
 */
export type EmailProvider = "zeptomail" | "zoho";
export interface Mail { to: string; toName?: string; subject: string; text: string; html: string }

export function emailProvider(env: NodeJS.ProcessEnv = process.env): EmailProvider | null {
  const forced = env.EMAIL_PROVIDER?.toLowerCase();
  const zepto = !!env.ZEPTOMAIL_TOKEN, zoho = !!(env.ZOHO_SMTP_USER && env.ZOHO_SMTP_PASSWORD);
  if (!env.EMAIL_FROM && !(zoho && env.ZOHO_SMTP_USER)) return null;
  if (forced === "zeptomail") return zepto ? "zeptomail" : null;
  if (forced === "zoho") return zoho ? "zoho" : null;
  return zepto ? "zeptomail" : zoho ? "zoho" : null;
}

const fromAddress = () => process.env.EMAIL_FROM || process.env.ZOHO_SMTP_USER || "";
const fromName = () => process.env.EMAIL_FROM_NAME || "Dev Dashboard";

export async function sendEmail(m: Mail): Promise<{ provider: EmailProvider }> {
  const provider = emailProvider();
  if (!provider) throw new Error("Email is not set up (ZEPTOMAIL_TOKEN or ZOHO_SMTP_USER/ZOHO_SMTP_PASSWORD, and EMAIL_FROM).");
  if (provider === "zeptomail") {
    const token = process.env.ZEPTOMAIL_TOKEN!.trim();
    const res = await fetch(`${zeptoBase()}/v1.1/email`, {
      method: "POST", signal: AbortSignal.timeout(20_000), cache: "no-store",
      headers: { "content-type": "application/json", accept: "application/json", Authorization: /^Zoho-enczapikey /i.test(token) ? token : `Zoho-enczapikey ${token}` },
      body: JSON.stringify({ from: { address: fromAddress(), name: fromName() }, to: [{ email_address: { address: m.to, name: m.toName ?? m.to } }], subject: m.subject, htmlbody: m.html, textbody: m.text }),
    });
    if (!res.ok) throw new Error(`ZeptoMail ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return { provider };
  }
  const t = nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST || "smtp.zoho.com", port: Number(process.env.ZOHO_SMTP_PORT || 465), secure: Number(process.env.ZOHO_SMTP_PORT || 465) === 465,
    auth: { user: process.env.ZOHO_SMTP_USER, pass: process.env.ZOHO_SMTP_PASSWORD }, connectionTimeout: 15_000, socketTimeout: 20_000,
  });
  await t.sendMail({ from: `"${fromName()}" <${fromAddress()}>`, to: m.toName ? `"${m.toName.replace(/"/g, "")}" <${m.to}>` : m.to, subject: m.subject, text: m.text, html: m.html });
  return { provider };
}

/** The ZeptoMail API host. Defaults to cpaas.zoho.com. A value typed without https:// still works, and a pasted full send URL (…/v1.1/email) is reduced to the host. */
export const ZEPTO_DEFAULT_HOST = "https://cpaas.zoho.com";
export function zeptoBase(raw = process.env.ZEPTOMAIL_URL): string {
  const v = (raw ?? "").trim().replace(/\/+$/, "").replace(/\/v1\.1\/email$/i, "");
  if (!v) return ZEPTO_DEFAULT_HOST;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Plain, widely compatible HTML: a heading, paragraphs, a list and one button. */
export function renderEmail(o: { title: string; intro: string; items?: string[]; button?: { label: string; url: string }; footer?: string }) {
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#111827"><div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#ffffff;border:1px solid #e2e5eb;border-radius:12px;padding:24px">`
    + `<h2 style="margin:0 0 12px;font-size:18px">${esc(o.title)}</h2><p style="margin:0 0 12px;line-height:1.5">${esc(o.intro)}</p>`
    + (o.items?.length ? `<ul style="margin:0 0 16px;padding-left:20px;line-height:1.6">${o.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "")
    + (o.button ? `<p style="margin:16px 0 0"><a href="${esc(o.button.url)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${esc(o.button.label)}</a></p>` : "")
    + `</div><p style="color:#6b7280;font-size:12px;margin:12px 4px">${esc(o.footer ?? "You can change these alerts in Settings.")}</p></div></body></html>`;
  const text = [o.title, "", o.intro, ...(o.items?.length ? ["", ...o.items.map((i) => `- ${i}`)] : []), ...(o.button ? ["", `${o.button.label}: ${o.button.url}`] : []), "", o.footer ?? "You can change these alerts in Settings."].join("\n");
  return { html, text };
}
