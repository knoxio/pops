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
          await (node.query as () => Promise<unknown>)();
        } else if (typeof node.mutate === 'function') {
          await (node.mutate as (input: Record<string, never>) => Promise<unknown>)({});
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
