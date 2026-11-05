/**
 * Creates a user with a one-time password. Use it to create the FIRST admin (nobody can sign in until one exists).
 *   npm run user:create -- --email you@company.com --name "Your Name" --access ADMIN
 * Uses DATABASE_URL from the environment. The password is written to a private file, never printed.
 */
import { writeFileSync, chmodSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword, passwordProblem } from "../src/lib/auth/password";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };
const email = arg("email")?.trim().toLowerCase(), name = arg("name")?.trim(), access = (arg("access") ?? "DEVELOPER").toUpperCase();

(async () => {
  if (!email || !name) throw new Error('Usage: npm run user:create -- --email a@b.com --name "Full Name" [--access ADMIN|LEAD|DEVELOPER]');
  if (!["ADMIN", "LEAD", "DEVELOPER"].includes(access)) throw new Error("--access must be ADMIN, LEAD or DEVELOPER");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
  const db = new PrismaClient();
  try {
    if (await db.developer.findUnique({ where: { email } })) throw new Error("A user with that email already exists.");
    let temp = generateTempPassword();
    while (passwordProblem(temp, { email, name })) temp = generateTempPassword();
    await db.developer.create({ data: { email, name, access: access as "ADMIN" | "LEAD" | "DEVELOPER", passwordHash: await hashPassword(temp), mustChangePassword: true, avatarHue: Math.floor(Math.random() * 360) } });
    const file = `.credentials-${email.replace(/[^a-z0-9]/g, "_")}.txt`;
    writeFileSync(file, `Email: ${email}\nTemporary password: ${temp}\n(You must change it at first sign-in. Delete this file afterwards.)\n`, { mode: 0o600 });
    chmodSync(file, 0o600);
    console.log(`Created ${access} ${email}. One-time password saved to ${file} (read it, sign in, then delete the file).`);
  } finally { await db.$disconnect(); }
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
