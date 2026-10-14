import { cookies } from "next/headers";
import { db } from "./db";

/** "Who am I?" — a cookie selected from the sidebar (no auth layer: this is an internal team tool). */
export async function currentDeveloper() {
  const id = (await cookies()).get("dev")?.value;
  const dev = (id && (await db.developer.findUnique({ where: { id } }))) || (await db.developer.findFirst({ orderBy: { name: "asc" } }));
  return dev;
}
