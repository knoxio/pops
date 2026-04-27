/** Sub-hook: scope inference (query + confirmation state). */
import { useCallback, useState } from 'react';

import { trpc } from '@pops/api-client';

import type { IngestFormValues, ScopeEntry } from './types';

export function useScopeInference(form: IngestFormValues, knownScopes: ScopeEntry[]) {
  const [inferredScopes, setInferredScopes] = useState<string[] | null>(null);
  const [showScopeConfirm, setShowScopeConfirm] = useState(false);

  const inferQuery = trpc.cerebrum.ingest.inferScopes.useQuery(
    {
      body: form.body,
      type: form.type || 'capture',
      tags: form.tags.length > 0 ? form.tags : undefined,
      source: 'manual',
      knownScopes: knownScopes.map((s) => s.scope),
    },
    { enabled: false }
  );

  const run = useCallback(async () => {
    const result = await inferQuery.refetch();
    if (result.data?.scopes && result.data.scopes.length > 0) {
      setInferredScopes(result.data.scopes);
      setShowScopeConfirm(true);
    }
  }, [inferQuery]);

  const confirm = useCallback(
    (applyToForm: (scopes: string[]) => void) => {
      if (inferredScopes) applyToForm(inferredScopes);
      setShowScopeConfirm(false);
      setInferredScopes(null);
    },
    [inferredScopes]
  );

  const dismiss = useCallback(() => {
    setShowScopeConfirm(false);
    setInferredScopes(null);
  }, []);

  return {
    inferredScopes,
    showScopeConfirm,
    isInferring: inferQuery.isFetching,
    run,
    confirm,
    dismiss,
  };
}
