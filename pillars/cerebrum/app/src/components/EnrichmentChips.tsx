/**
 * EnrichmentChips — post-ingest review surface.
 *
 * Polls `POST /ingest/enrichment-status` until the curation worker completes,
 * then renders the inferred type / template / scopes / tags as editable chips
 * alongside any scope reconciliation suggestions ("Did you mean: …").
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useState } from 'react';

import { engramsUpdate, ingestEnrichmentStatus, ingestRetryEnrichment } from '../cerebrum-api';
import { unwrap } from '../cerebrum-api-helpers';
import {
  appendUnique,
  hasStoppedPolling,
  refetchInterval,
  replaceScope,
  segmentSetKey,
} from './enrichment-chips-helpers';
import { ChipGrid, EnrichmentHeader } from './EnrichmentChipsParts';
import { ScopeSuggestionList } from './ScopeSuggestionList';

interface EnrichmentChipsProps {
  engramId: string;
}

interface EnrichmentStatus {
  enriched: boolean;
  type: string;
  template: string | null;
  scopes: string[];
  tags: string[];
  scopeSuggestions: Array<{
    original: string;
    canonical: string;
    confidence: number;
    reason: string;
  }>;
  customFields?: Record<string, unknown>;
}

type EnrichmentUpdateInput = {
  id: string;
  scopes?: string[];
  customFields?: Record<string, unknown>;
};

function useEnrichmentMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['cerebrum', 'ingest', 'enrichmentStatus'] });
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...patch }: EnrichmentUpdateInput) =>
      unwrap(await engramsUpdate({ path: { id }, body: patch })),
    onSuccess: invalidate,
  });
  const retryMutation = useMutation({
    mutationFn: async (input: { engramId: string }) =>
      unwrap(await ingestRetryEnrichment({ body: input })),
    onSuccess: invalidate,
  });
  return { updateMutation, retryMutation };
}

export function EnrichmentChips({ engramId }: EnrichmentChipsProps) {
  const [startedAt] = useState(() => Date.now());

  const statusQuery = useQuery({
    queryKey: ['cerebrum', 'ingest', 'enrichmentStatus', { engramId }],
    queryFn: async () => unwrap(await ingestEnrichmentStatus({ body: { engramId } })),
    refetchInterval: (query) => {
      const elapsed = Date.now() - startedAt;
      const data = query.state.data;
      return refetchInterval(elapsed, data?.enriched ?? false);
    },
  });

  const { updateMutation, retryMutation } = useEnrichmentMutations();

  const status = statusQuery.data;
  const stoppedPolling = hasStoppedPolling(Date.now() - startedAt, status?.enriched ?? false);

  const handlers = useChipHandlers(engramId, status, updateMutation);

  return (
    <div className="space-y-3">
      <EnrichmentHeader
        enriched={status?.enriched ?? false}
        stoppedPolling={stoppedPolling}
        onRetry={() => retryMutation.mutate({ engramId })}
        retryPending={retryMutation.isPending}
      />
      {status && <ChipGrid status={status} onRemoveScope={handlers.removeScope} />}
      {status && status.scopeSuggestions.length > 0 && (
        <ScopeSuggestionList
          suggestions={status.scopeSuggestions}
          onAccept={handlers.acceptSuggestion}
          onDismiss={handlers.dismissSuggestion}
          pending={updateMutation.isPending}
        />
      )}
    </div>
  );
}

function useChipHandlers(
  engramId: string,
  status: EnrichmentStatus | undefined,
  updateMutation: UseMutationResult<{ engram: unknown }, Error, EnrichmentUpdateInput>
) {
  const acceptSuggestion = (original: string, canonical: string) => {
    if (!status) return;
    const nextScopes = replaceScope(status.scopes, original, canonical);
    const remaining = status.scopeSuggestions.filter((s) => s.original !== original);
    updateMutation.mutate({
      id: engramId,
      scopes: nextScopes,
      customFields: { _scope_suggestions: remaining },
    });
  };

  const dismissSuggestion = (canonical: string) => {
    if (!status) return;
    const remaining = status.scopeSuggestions.filter((s) => s.canonical !== canonical);
    updateMutation.mutate({
      id: engramId,
      customFields: {
        _scope_suggestions: remaining,
        _scope_suggestions_dismissed: appendUnique(
          readDismissed(status.customFields),
          segmentSetKey(canonical)
        ),
      },
    });
  };

  const removeScope = (scope: string) => {
    if (!status) return;
    const next = status.scopes.filter((s) => s !== scope);
    if (next.length === 0) return; // engrams must have at least one scope
    updateMutation.mutate({ id: engramId, scopes: next });
  };

  return { acceptSuggestion, dismissSuggestion, removeScope };
}

function readDismissed(customFields: Record<string, unknown> | undefined): string[] {
  const raw = customFields?.['_scope_suggestions_dismissed'];
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string');
}
