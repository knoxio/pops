import { Clock, Database, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { Button, Switch } from '@pops/ui';

import { formatSyncDate, sourceTypeLabel, type Source } from './types';

interface SourceCardProps {
  source: Source;
  onEdit: () => void;
}

function useSourceMutations(source: Source) {
  const utils = trpc.useUtils();

  const syncMutation = trpc.media.rotation.syncSource.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced "${source.name}": ${data.candidatesInserted} new candidates`);
      void utils.media.rotation.listSources.invalidate();
    },
    onError: () => toast.error(`Failed to sync "${source.name}"`),
  });

  const toggleMutation = trpc.media.rotation.updateSource.useMutation({
    onSuccess: () => {
      void utils.media.rotation.listSources.invalidate();
    },
    onError: () => toast.error('Failed to update source'),
  });

  const deleteMutation = trpc.media.rotation.deleteSource.useMutation({
    onSuccess: () => {
      toast.success(`Deleted "${source.name}"`);
      void utils.media.rotation.listSources.invalidate();
    },
    onError: (err) => toast.error(err.message || 'Failed to delete source'),
  });

  return { syncMutation, toggleMutation, deleteMutation };
}

function SourceCardInfo({ source }: { source: Source }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-medium truncate">{source.name}</span>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          {sourceTypeLabel(source.type)}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
        <span>Priority: {source.priority}/10</span>
        <span className="flex items-center gap-1">
          <Database className="h-3 w-3" />
          {source.candidateCount} candidates
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatSyncDate(source.lastSyncedAt)}
        </span>
      </div>
    </div>
  );
}

export function SourceCard({ source, onEdit }: SourceCardProps) {
  const { syncMutation, toggleMutation, deleteMutation } = useSourceMutations(source);
  const isManual = source.type === 'manual';

  return (
    <div className="flex items-center gap-4 rounded-md border p-4">
      <SourceCardInfo source={source} />
      <div className="flex items-center gap-2 shrink-0">
        <Switch
          checked={source.enabled === 1}
          onCheckedChange={(checked) => {
            toggleMutation.mutate({ id: source.id, enabled: checked });
          }}
          disabled={toggleMutation.isPending}
          aria-label={`Toggle ${source.name}`}
        />
        {!isManual && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              syncMutation.mutate({ sourceId: source.id });
            }}
            disabled={syncMutation.isPending || source.enabled !== 1}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        {!isManual && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (window.confirm(`Delete "${source.name}" and all its candidates?`)) {
                deleteMutation.mutate({ id: source.id });
              }
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}
