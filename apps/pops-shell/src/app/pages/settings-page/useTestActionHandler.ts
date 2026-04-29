import { trpc } from '@/lib/trpc';
import { useCallback } from 'react';

/**
 * Resolves a dot-delimited tRPC procedure name (e.g. "media.plex.testConnection")
 * to a callable query/mutate on the tRPC client and invokes it.
 *
 * Dynamic property traversal is unavoidable here because the procedure path
 * comes from settings manifest data at runtime. The tRPC client tree is typed
 * as a deeply nested object but we need to walk it with arbitrary string keys.
 */

/** Throws if the procedure response signals a failed connection without throwing. */
function assertConnected(result: unknown): void {
  if (!result || typeof result !== 'object') return;
  const data = (result as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return;
  const typed = data as { connected?: boolean; error?: string };
  if (typed.connected === false) {
    throw new Error(typed.error ?? 'Connection failed');
  }
}

export function useTestActionHandler() {
  const utils = trpc.useUtils();

  return useCallback(
    async (procedure: string) => {
      const parts = procedure.split('.');
      let current: unknown = utils.client;
      for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object') {
          throw new Error(`Unknown procedure: ${procedure}`);
        }
        current = (current as Record<string, unknown>)[part];
        if (!current) throw new Error(`Unknown procedure: ${procedure}`);
      }
      if (current !== null && typeof current === 'object') {
        const node = current as Record<string, unknown>;
        if (typeof node.query === 'function') {
          const result = await (node.query as () => Promise<unknown>)();
          assertConnected(result);
        } else if (typeof node.mutate === 'function') {
          const result = await (node.mutate as (input: Record<string, never>) => Promise<unknown>)(
            {}
          );
          assertConnected(result);
        } else {
          throw new Error(`Cannot call procedure: ${procedure}`);
        }
      } else {
        throw new Error(`Cannot call procedure: ${procedure}`);
      }
    },
    [utils]
  );
}
