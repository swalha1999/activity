import { AsyncLocalStorage } from "node:async_hooks";
import type { ActivityContext } from "./types.js";

const asyncLocalStorage = new AsyncLocalStorage<ActivityContext>();

export function setContext<T>(ctx: ActivityContext, fn: () => T): T {
  return asyncLocalStorage.run(ctx, fn);
}

export function getContext(): ActivityContext | undefined {
  return asyncLocalStorage.getStore();
}
