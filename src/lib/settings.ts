import { db } from "./db";

export async function getSetting<T>(key: string): Promise<T | null> {
  const row = await db.appSetting.findUnique({ where: { key } });
  return (row?.value as T) ?? null;
}
export async function setSetting(key: string, value: unknown) {
  await db.appSetting.upsert({ where: { key }, update: { value: value as any }, create: { key, value: value as any } });
}
