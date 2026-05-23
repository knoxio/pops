import { trpc } from '@/lib/trpc';
import { traverseTrpcPath } from '@/lib/trpc-traverse';
import { useCallback } from 'react';

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

/** Dynamic traversal is unavoidable — procedure paths come from manifest data at runtime. */
export function useTestActionHandler() {
  const utils = trpc.useUtils();

  return useCallback(
    async (procedure: string) => {
      const node = traverseTrpcPath(utils.client, procedure);
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
    },
    [utils]
  );
}
