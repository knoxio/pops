/**
 * Production adapter that wires the {@link ReconcileLookupFn} contract to
 * the pillar SDK proxy. Calls `pillar('core').users.get({ uri })` and
 * folds the {@link CallResult} discriminants down to the cron's smaller
 * vocabulary (`ok` / `not-found` / `bad-uri` / `unavailable`).
 *
 * Kept separate from the worker so unit tests can wire a stub directly
 * without exercising the HTTP transport.
 */
import { isOk, pillar, type CallResult } from '@pops/pillar-sdk/client';

import type { ReconcileLookupFn, ReconcileLookupResult } from './reconcile-cross-pillar.js';

type UsersGetResponse = { uri: string; displayName: string; kind: string } | null;

type CoreUsersHandle = {
  users: {
    get: (input: { uri: string }) => Promise<CallResult<UsersGetResponse>>;
  };
};

export function createPillarOwnerUriLookup(): ReconcileLookupFn {
  return async (uri: string): Promise<ReconcileLookupResult> => {
    const handle = pillar<CoreUsersHandle>('core');
    const result = await handle.users.get({ uri });
    if (isOk(result)) {
      if (result.value === null) return { kind: 'not-found' };
      return { kind: 'ok' };
    }
    switch (result.kind) {
      case 'not-found':
        return { kind: 'not-found' };
      case 'bad-request':
        return { kind: 'bad-uri', reason: result.message ?? 'bad-request' };
      case 'unavailable':
      case 'degraded':
      case 'contract-mismatch':
      case 'conflict':
        return { kind: 'unavailable', reason: result.kind };
    }
  };
}
