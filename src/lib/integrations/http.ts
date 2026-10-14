export class IntegrationError extends Error {
  constructor(public service: string, message: string, public status?: number) { super(`${service}: ${message}`); }
}
export async function request<T>(service: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init.headers ?? {}) }, cache: "no-store" });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!res.ok) throw new IntegrationError(service, `${res.status} ${text.slice(0, 300)}`, res.status);
  return (text ? JSON.parse(text) : undefined) as T;
}
