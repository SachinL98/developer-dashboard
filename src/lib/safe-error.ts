/**
 * Error text that is safe to show to a user. Validation, permission and integration errors carry messages written for people;
 * anything else (database driver errors, stack-bearing internals) is replaced with a generic message and logged server-side.
 */
export function userMessage(e: unknown, log: (m: string) => void = (m) => console.error(m)): string {
  if (!(e instanceof Error)) return "Something went wrong. Please try again.";
  const name = e.constructor?.name ?? "";
  const looksInternal = /^PrismaClient/.test(name) || /Invalid `prisma\./.test(e.message) || /\bprisma\b.*invocation/i.test(e.message) || /ECONN|ETIMEDOUT|ENOTFOUND|getaddrinfo|socket hang up/i.test(e.message) || e.message.includes("\n    at ");
  if (looksInternal) {
    log(`[action error] ${name}: ${e.message.slice(0, 500)}`);
    if (/Record to update not found|No .* found|Expected a record/i.test(e.message)) return "That item no longer exists. Refresh and try again.";
    return "Something went wrong on our side. Please try again.";
  }
  return e.message.slice(0, 400);
}
