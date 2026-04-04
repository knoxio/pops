import type { SearchAdapter } from "./types.js";

const adapters: SearchAdapter[] = [];

export function registerSearchAdapter(adapter: SearchAdapter): void {
  const duplicate = adapters.find((a) => a.domain === adapter.domain);
  if (duplicate) {
    throw new Error(`Search adapter for domain "${adapter.domain}" is already registered`);
  }
  adapters.push(adapter);
}

export function getAdapters(): SearchAdapter[] {
  return [...adapters];
}

/**
 * Resets the adapter registry to an empty state.
 * Intended for test isolation only — do not call in production code.
 */
export function resetRegistry(): void {
  adapters.length = 0;
}
