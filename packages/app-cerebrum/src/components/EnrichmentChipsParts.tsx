import { Loader2, RefreshCw } from 'lucide-react';

import { Badge, Button, Chip } from '@pops/ui';

interface EnrichmentHeaderProps {
  enriched: boolean;
  stoppedPolling: boolean;
  onRetry: () => void;
  retryPending: boolean;
}

export function EnrichmentHeader({
  enriched,
  stoppedPolling,
  onRetry,
  retryPending,
}: EnrichmentHeaderProps) {
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

interface ChipGridProps {
  status: { type: string; template: string | null; scopes: string[]; tags: string[] };
  onRemoveScope: (scope: string) => void;
}

export function ChipGrid({ status, onRemoveScope }: ChipGridProps) {
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
