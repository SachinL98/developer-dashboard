// Decides whether two display names are the same person. Conservative on purpose: callers also require exactly one candidate.
import { levenshtein, norm } from "./speakers";

const tokens = (s: string) => norm(s).split(" ").filter(Boolean);

export function sameName(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const tx = tokens(a), ty = tokens(b);
  const [short, long] = tx.length <= ty.length ? [tx, ty] : [ty, tx];
  // Same words in another order ("Lakshan Sachin").
  if (tx.length === ty.length && [...tx].sort().join(" ") === [...ty].sort().join(" ")) return true;
  // "Sachin Lakshan" inside "Sachin Lakshan Perera": every word of the shorter name appears in the longer one (needs two words).
  if (short.length >= 2 && short.every((t) => long.includes(t))) return true;
  // Same first and last word ("Sachin Lakshan" and "Sachin K Lakshan").
  if (tx.length >= 2 && ty.length >= 2 && tx[0] === ty[0] && tx[tx.length - 1] === ty[ty.length - 1]) return true;
  // A one-letter typo, only in a long name (short names like Amal and Amali are different people).
  return x.length >= 14 && Math.abs(x.length - y.length) <= 1 && levenshtein(x, y) <= 1;
}

/** The one candidate whose name matches, or null when there is none or more than one (never guess). */
export function uniqueMatch<T extends { name: string }>(name: string, candidates: T[]): T | null {
  const hits = candidates.filter((c) => sameName(name, c.name));
  return hits.length === 1 ? hits[0] : null;
}
