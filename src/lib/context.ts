import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Which user's OAuth connections (Jira / Google) integration calls should use.
 * Bound once per request after the session is resolved; unbound = service-level fallback.
 */
const als = new AsyncLocalStorage<{ userId?: string }>();
export const bindUser = (userId: string) => als.enterWith({ userId });
export const boundUserId = () => als.getStore()?.userId;
export const runAs = <T>(userId: string | undefined, fn: () => Promise<T>) => als.run({ userId }, fn);
