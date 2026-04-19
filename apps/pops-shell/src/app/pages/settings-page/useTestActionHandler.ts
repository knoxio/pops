import { trpc } from '@/lib/trpc';
import { useCallback } from 'react';

export function useTestActionHandler() {
  const utils = trpc.useUtils();

  return useCallback(
    async (procedure: string) => {
      const parts = procedure.split('.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let current: any = utils.client;
      for (const part of parts) {
        current = current[part];
        if (!current) throw new Error(`Unknown procedure: ${procedure}`);
      }
      if (typeof current.query === 'function') {
        await current.query();
      } else if (typeof current.mutate === 'function') {
        await current.mutate({});
      } else {
        throw new Error(`Cannot call procedure: ${procedure}`);
      }
    },
    [utils]
  );
}
