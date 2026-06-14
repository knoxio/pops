/**
 * Runtime `appRouter` composition (PRD-242 US-02).
 *
 * The orchestrator boot composes the live tRPC router from two halves:
 *
 *   - The static, in-repo half: the codegen catalogue
 *     (`KNOWN_ROUTERS_GENERATED`, PRD-242 US-01) intersected with the install
 *     set (`installedManifests()`). This is exactly the surface the build-
 *     time `AppRouter` type describes; type-narrowing for in-repo clients
 *     comes from here.
 *
 *   - The dynamic half: zero or more `origin: 'external'` pillars held in the
 *     in-process `ExternalsRegistry`. Each is mounted as a passthrough router
 *     under its pillar id (`buildExternalPillarRouter`).
 *
 * The two halves are combined with `mergeRouters` (re-exported from
 * `apps/pops-api/src/trpc.ts`) so external pillars appear as sibling top-
 * level routers alongside the in-repo bunch — exactly the surface a tRPC
 * client sees.
 *
 * Recomposition is debounced (250ms, matching PRD-228's nginx-regen contract).
 * Multiple register / deregister events during a deploy collapse to a single
 * swap of the holder's `current` field. The express middleware reads
 * `holder.current` per request, so the swap is observed atomically without
 * connection draining.
 */
import { appRouter as defaultStaticAppRouter } from '../router.js';
import { mergeRouters, router } from '../trpc.js';
import {
  buildExternalPillarRouter,
  deferredExternalForwarder,
  type ExternalForwarder,
} from './external-router.js';
import { type ExternalsRegistry } from './externals-registry.js';

import type { AnyRouter } from '@trpc/server';

export interface AppRouterHolder {
  current: AnyRouter;
  stop(): void;
}

export interface ComposeOptions {
  readonly registry: ExternalsRegistry;
  readonly forward?: ExternalForwarder;
  readonly debounceMs?: number;
  readonly staticBase?: AnyRouter;
}

const DEFAULT_DEBOUNCE_MS = 250;

/**
 * Wrap `inner` under a single top-level key `id` so the external pillar's
 * procedures appear as `${id}.<proc>` rather than at the root after
 * `mergeRouters` flattens its arguments.
 */
function namespaceUnderId(id: string, inner: AnyRouter): AnyRouter {
  const record: Record<string, AnyRouter> = { [id]: inner };
  return router(record);
}

/**
 * Build the merged router at this instant — `staticBase` + every currently
 * registered external. Pure function; suitable for both boot and tests.
 */
export function composeAppRouter(input: {
  readonly registry: ExternalsRegistry;
  readonly forward: ExternalForwarder;
  readonly staticBase: AnyRouter;
}): AnyRouter {
  const externals = input.registry
    .list()
    .map((entry) =>
      namespaceUnderId(entry.pillarId, buildExternalPillarRouter(entry, input.forward))
    );
  return mergeRouters(input.staticBase, ...externals);
}

/**
 * Install the runtime composition: build the initial router, subscribe to
 * registry events, and recompose on every change (debounced). Returns a
 * holder whose `current` field is the live router and a `stop()` to detach
 * the listener (used by tests).
 */
export function installAppRouterHolder(options: ComposeOptions): AppRouterHolder {
  const staticBase = options.staticBase ?? defaultStaticAppRouter;
  const forward = options.forward ?? deferredExternalForwarder;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  let pending: ReturnType<typeof setTimeout> | null = null;

  const recompose = (): void => {
    holder.current = composeAppRouter({ registry: options.registry, forward, staticBase });
  };

  const onChange = (): void => {
    if (debounceMs <= 0) {
      recompose();
      return;
    }
    if (pending !== null) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      recompose();
    }, debounceMs);
  };

  const unsubscribe = options.registry.onChange(onChange);

  const holder: AppRouterHolder = {
    current: composeAppRouter({ registry: options.registry, forward, staticBase }),
    stop(): void {
      unsubscribe();
      if (pending !== null) {
        clearTimeout(pending);
        pending = null;
      }
    },
  };

  return holder;
}
