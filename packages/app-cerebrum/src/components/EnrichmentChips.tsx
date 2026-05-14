/**
 * EnrichmentChips — post-ingest review surface (PRD-081 US-07).
 *
 * Polls cerebrum.ingest.enrichmentStatus until the curation worker completes,
 * then renders the inferred type / template / scopes / tags as editable chips
 * alongside any scope reconciliation suggestions ("Did you mean: …").
 */
import { Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { trpc } from '@pops/api-client';
import { Badge, Button, Chip } from '@pops/ui';

import {
  appendUnique,
  hasStoppedPolling,
  refetchInterval,
  replaceScope,
  segmentSetKey,
} from './enrichment-chips-helpers';
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

export function EnrichmentChips({ engramId }: EnrichmentChipsProps) {
  const [startedAt] = useState(() => Date.now());

  const statusQuery = trpc.cerebrum.ingest.enrichmentStatus.useQuery(
    { engramId },
    {
      refetchInterval: (query) => {
        const elapsed = Date.now() - startedAt;
        const data = query.state.data;
        return refetchInterval(elapsed, data?.enriched ?? false);
      },
    }
  );

  const utils = trpc.useUtils();
  const updateMutation = trpc.cerebrum.engrams.update.useMutation({
    onSuccess: () => {
      void utils.cerebrum.ingest.enrichmentStatus.invalidate({ engramId });
    },
  });
  const retryMutation = trpc.cerebrum.ingest.retryEnrichment.useMutation({
    onSuccess: () => {
      void utils.cerebrum.ingest.enrichmentStatus.invalidate({ engramId });
    },
  });

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
  updateMutation: ReturnType<typeof trpc.cerebrum.engrams.update.useMutation>
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

function EnrichmentHeader({
  enriched,
  stoppedPolling,
  onRetry,
  retryPending,
}: {
  enriched: boolean;
  stoppedPolling: boolean;
  onRetry: () => void;
  retryPending: boolean;
}) {
  if (enriched) {
    return <h4 className="text-sm font-semibold text-muted-foreground">Enriched</h4>;
  }
  if (stoppedPolling) {
    return (
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Enrichment didn't complete in time.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={retryPending}
          prefix={<RefreshCw className="h-3.5 w-3.5" />}
        >
          Retry enrichment
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Enriching…
    </div>
  );
}

function ChipGrid({
  status,
  onRemoveScope,
}: {
  status: { type: string; template: string | null; scopes: string[]; tags: string[] };
  onRemoveScope: (scope: string) => void;
}) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="text-muted-foreground self-center">Type</dt>
      <dd>
        <Badge variant="secondary">{status.type}</Badge>
      </dd>
      {status.template && (
        <>
          <dt className="text-muted-foreground self-center">Template</dt>
          <dd>
            <Badge variant="outline">{status.template}</Badge>
          </dd>
        </>
      )}
      <dt className="text-muted-foreground self-center">Scopes</dt>
      <dd className="flex flex-wrap gap-1.5">
        {status.scopes.map((scope) => (
          <Chip key={scope} size="sm" removable onRemove={() => onRemoveScope(scope)}>
            {scope}
          </Chip>
        ))}
      </dd>
      {status.tags.length > 0 && (
        <>
          <dt className="text-muted-foreground self-center">Tags</dt>
          <dd className="flex flex-wrap gap-1.5">
            {status.tags.map((tag) => (
              <Chip key={tag} size="sm">
                {tag}
              </Chip>
            ))}
          </dd>
        </>
      )}
    </dl>
  );
}

function readDismissed(customFields: Record<string, unknown> | undefined): string[] {
  const raw = customFields?.['_scope_suggestions_dismissed'];
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string');
}
