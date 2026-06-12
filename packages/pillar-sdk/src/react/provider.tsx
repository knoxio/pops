import { QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useMemo } from 'react';

import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { PillarClientOptions } from '../client/factory.js';

const PillarSdkContext = createContext<PillarClientOptions | null>(null);

export type PillarSdkProviderProps = {
  /** Forwarded to every `pillar()` call made by the hooks. */
  options?: PillarClientOptions;
  /**
   * Optional `QueryClient`. When provided the provider also wires a
   * `QueryClientProvider`. When omitted, the host shell is expected to
   * have its own `QueryClientProvider` further up the tree — the hooks
   * read from whichever is closest.
   */
  queryClient?: QueryClient;
  children: ReactNode;
};

/**
 * Wires the `pillar()` SDK options (transport, registry config, auth
 * headers, contract version) into React context so `usePillarQuery` /
 * `usePillarMutation` pick them up.
 *
 * Layering: the provider is intentionally lightweight. If you pass a
 * `queryClient`, it nests a `QueryClientProvider` for convenience;
 * otherwise it composes cleanly under an existing one (the common case
 * inside `pops-shell`, which already owns its `QueryClientProvider`).
 */
export function PillarSdkProvider({
  options,
  queryClient,
  children,
}: PillarSdkProviderProps): ReactNode {
  const memoised = useMemo<PillarClientOptions>(() => options ?? {}, [options]);
  const inner = <PillarSdkContext.Provider value={memoised}>{children}</PillarSdkContext.Provider>;
  if (queryClient) {
    return <QueryClientProvider client={queryClient}>{inner}</QueryClientProvider>;
  }
  return inner;
}

/**
 * Reads the closest `PillarSdkProvider` options. Returns an empty options
 * object when no provider is present — the hooks still work in that case,
 * they just fall back to `pillar()`'s built-in defaults (shared discovery
 * cache, default fetch, no auth headers).
 */
export function usePillarSdkOptions(): PillarClientOptions {
  return useContext(PillarSdkContext) ?? EMPTY_OPTIONS;
}

const EMPTY_OPTIONS: PillarClientOptions = {};
