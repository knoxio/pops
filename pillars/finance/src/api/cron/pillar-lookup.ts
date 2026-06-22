/**
 * Production adapter that wires the {@link ReconcileLookupFn} contract to
 * the pillar SDK proxy. Calls `pillar('registry').users.get({ uri })` and
 * folds the {@link CallResult} discriminants down to the cron's smaller
 * vocabulary (`ok` / `not-found` / `bad-uri` / `unavailable`).
 *
 * Wire contract: PRD-251 §"Surface" specifies a URI-shaped cross-pillar
 * contract — input `{ uri }`, output `{ data: { uri } }`. Both the
 * inventory and finance crons go through the same `registry.users.get`
 * (the registry pillar, formerly `core`) and pass the URI through
 * end-to-end.
 *
 * Kept separate from the worker so unit tests can wire a stub directly
 * without exercising the HTTP transport.
 */
import { isOk, pillar, type CallResult } from '@pops/pillar-sdk/client';

import type { ReconcileLookupFn, ReconcileLookupResult } from './reconcile-cross-pillar.js';

type UsersGetResponse = { data: { uri: string } };

type CoreUsersHandle = {
  users: {
    get: (input: { uri: string }) => Promise<CallResult<UsersGetResponse>>;
  };
};

export function createPillarOwnerUriLookup(): ReconcileLookupFn {
  return async (uri: string): Promise<ReconcileLookupResult> => {
    const handle = pillar<CoreUsersHandle>('registry');
    const result = await handle.users.get({ uri });
    if (isOk(result)) {
      return { kind: 'ok' };
    }
    switch (result.kind) {
      case 'not-found':
        return { kind: 'not-found' };
      case 'bad-request':
        return { kind: 'bad-uri', reason: result.message ?? 'bad-request' };
      case 'unauthorized':
      case 'unavailable':
      case 'degraded':
      case 'contract-mismatch':
      case 'conflict':
        return { kind: 'unavailable', reason: result.kind };
    }
  };
}
