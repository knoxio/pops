import type { SearchAdapter } from "./types.js";

const adapters: SearchAdapter[] = [];

export function registerSearchAdapter(adapter: SearchAdapter): void {
  const duplicate = adapters.find((a) => a.domain === adapter.domain);
  if (duplicate) {
    throw new Error(
      `Search adapter for domain "${adapter.domain}" is already registered`,
    );
  }
  adapters.push(adapter);
}

export function getAdapters(): SearchAdapter[] {
  return [...adapters];
}

export function resetRegistry(): void {
  adapters.length = 0;
}
