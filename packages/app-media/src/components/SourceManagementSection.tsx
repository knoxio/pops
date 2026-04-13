/**
 * SourceManagementSection — CRUD UI for rotation source management.
 *
 * PRD-072 US-03
 */
import { Button, Label, NumberInput, Select, Switch } from '@pops/ui';
import { Clock, Database, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '../lib/trpc';

// ---------------------------------------------------------------------------
// Type icons for source types
// ---------------------------------------------------------------------------

const SOURCE_TYPE_LABELS: Record<string, string> = {
  plex_watchlist: 'Plex Watchlist',
  plex_friends: 'Plex Friends',
  tmdb_top_rated: 'TMDB Top Rated',
  letterboxd: 'Letterboxd',
  manual: 'Manual Queue',
};

function sourceTypeLabel(type: string): string {
  return SOURCE_TYPE_LABELS[type] ?? type;
}

function formatSyncDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString();
}

// ---------------------------------------------------------------------------
// Source card
// ---------------------------------------------------------------------------

interface SourceCardProps {
  source: {
    id: number;
    type: string;
    name: string;
    priority: number;
    enabled: number;
    config: string | null;
    lastSyncedAt: string | null;
    syncIntervalHours: number;
    candidateCount: number;
  };
  onEdit: () => void;
}

function SourceCard({ source, onEdit }: SourceCardProps) {
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
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Deleted "${source.name}"`);
        void utils.media.rotation.listSources.invalidate();
      } else {
        toast.error('message' in data ? data.message : 'Failed to delete source');
      }
    },
    onError: () => toast.error('Failed to delete source'),
  });

  const isManual = source.type === 'manual';

  return (
    <div className="flex items-center gap-4 rounded-md border p-4">
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

      <div className="flex items-center gap-2 shrink-0">
        <Switch
          checked={source.enabled === 1}
          onCheckedChange={(checked) => toggleMutation.mutate({ id: source.id, enabled: checked })}
          disabled={toggleMutation.isPending}
          aria-label={`Toggle ${source.name}`}
        />

        {!isManual && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate({ sourceId: source.id })}
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

// ---------------------------------------------------------------------------
// Source form (shared between create and edit)
// ---------------------------------------------------------------------------

interface SourceFormProps {
  mode: 'create' | 'edit';
  initialValues?: {
    id?: number;
    type: string;
    name: string;
    priority: number;
    enabled: boolean;
    config: Record<string, unknown>;
    syncIntervalHours: number;
  };
  sourceTypes: string[];
  onClose: () => void;
}

function SourceForm({ mode, initialValues, sourceTypes, onClose }: SourceFormProps) {
  const [type, setType] = useState(initialValues?.type ?? sourceTypes[0] ?? 'plex_watchlist');
  const [name, setName] = useState(initialValues?.name ?? '');
  const [priority, setPriority] = useState(initialValues?.priority ?? 5);
  const [enabled, setEnabled] = useState(initialValues?.enabled ?? true);
  const [syncIntervalHours, setSyncIntervalHours] = useState(
    initialValues?.syncIntervalHours ?? 24
  );
  // Type-specific config
  const [configValues, setConfigValues] = useState<Record<string, unknown>>(
    initialValues?.config ?? {}
  );

  const utils = trpc.useUtils();

  const createMutation = trpc.media.rotation.createSource.useMutation({
    onSuccess: () => {
      toast.success('Source created');
      void utils.media.rotation.listSources.invalidate();
      onClose();
    },
    onError: () => toast.error('Failed to create source'),
  });

  const updateMutation = trpc.media.rotation.updateSource.useMutation({
    onSuccess: () => {
      toast.success('Source updated');
      void utils.media.rotation.listSources.invalidate();
      onClose();
    },
    onError: () => toast.error('Failed to update source'),
  });

  const plexFriendsQuery = trpc.media.rotation.listPlexFriends.useQuery(undefined, {
    enabled: type === 'plex_friends',
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }

    if (mode === 'create') {
      createMutation.mutate({
        type,
        name: name.trim(),
        priority,
        enabled,
        config: configValues,
        syncIntervalHours,
      });
    } else if (initialValues?.id) {
      updateMutation.mutate({
        id: initialValues.id,
        name: name.trim(),
        priority,
        enabled,
        config: configValues,
        syncIntervalHours,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <h3 className="text-lg font-semibold">{mode === 'create' ? 'Add Source' : 'Edit Source'}</h3>

      {mode === 'create' && (
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Source Type</Label>
          <Select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setConfigValues({});
            }}
            options={sourceTypes.map((t) => ({ value: t, label: sourceTypeLabel(t) }))}
            size="sm"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-muted-foreground">Name</Label>
        <input
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Source name"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Priority (1-10)</Label>
          <NumberInput
            value={priority}
            onChange={(e) => setPriority(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
            min={1}
            max={10}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Sync interval (hours)</Label>
          <NumberInput
            value={syncIntervalHours}
            onChange={(e) => setSyncIntervalHours(Math.max(1, Number(e.target.value) || 1))}
            min={1}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch checked={enabled} onCheckedChange={setEnabled} />
        <Label className="text-muted-foreground">Enabled</Label>
      </div>

      {/* Type-specific config fields */}
      {type === 'plex_friends' && (
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Plex Friend</Label>
          {plexFriendsQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading friends...</p>
          ) : plexFriendsQuery.data?.error ? (
            <p className="text-xs text-red-400">{plexFriendsQuery.data.error}</p>
          ) : (
            <Select
              value={(configValues.friendUuid as string) ?? ''}
              onChange={(e) => {
                const friend = plexFriendsQuery.data?.friends.find(
                  (f) => f.uuid === e.target.value
                );
                setConfigValues({
                  friendUuid: e.target.value,
                  friendUsername: friend?.username ?? '',
                });
              }}
              options={[
                { value: '', label: 'Select a friend...' },
                ...(plexFriendsQuery.data?.friends.map((f) => ({
                  value: f.uuid,
                  label: f.username,
                })) ?? []),
              ]}
              size="sm"
            />
          )}
        </div>
      )}

      {type === 'letterboxd' && (
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">List URL</Label>
          <input
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={(configValues.listUrl as string) ?? ''}
            onChange={(e) => setConfigValues({ ...configValues, listUrl: e.target.value })}
            placeholder="https://letterboxd.com/user/list/name/"
          />
        </div>
      )}

      {type === 'tmdb_top_rated' && (
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Pages to fetch (1-25)</Label>
          <NumberInput
            value={(configValues.pages as number) ?? 5}
            onChange={(e) =>
              setConfigValues({
                ...configValues,
                pages: Math.min(25, Math.max(1, Number(e.target.value) || 5)),
              })
            }
            min={1}
            max={25}
          />
          <p className="text-xs text-muted-foreground">~20 movies per page</p>
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={isPending} size="sm">
          {isPending ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
          {mode === 'create' ? 'Add Source' : 'Save Changes'}
        </Button>
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

export function SourceManagementSection() {
  const sourcesQuery = trpc.media.rotation.listSources.useQuery();
  const sourceTypesQuery = trpc.media.rotation.sourceTypes.useQuery();

  const [showForm, setShowForm] = useState<'create' | 'edit' | null>(null);
  const [editingSource, setEditingSource] = useState<{
    id: number;
    type: string;
    name: string;
    priority: number;
    enabled: boolean;
    config: Record<string, unknown>;
    syncIntervalHours: number;
  } | null>(null);

  const handleEdit = (source: NonNullable<typeof sourcesQuery.data>[number]) => {
    let config: Record<string, unknown> = {};
    try {
      if (source.config) config = JSON.parse(source.config) as Record<string, unknown>;
    } catch {
      /* empty */
    }
    setEditingSource({
      id: source.id,
      type: source.type,
      name: source.name,
      priority: source.priority,
      enabled: source.enabled === 1,
      config,
      syncIntervalHours: source.syncIntervalHours,
    });
    setShowForm('edit');
  };

  const sourceTypes = sourceTypesQuery.data?.types ?? [];

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Sources</h2>
          <p className="text-sm text-muted-foreground">
            Configure where candidate movies come from
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditingSource(null);
            setShowForm('create');
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Source
        </Button>
      </div>

      {showForm && (
        <SourceForm
          mode={showForm}
          initialValues={showForm === 'edit' && editingSource ? editingSource : undefined}
          sourceTypes={sourceTypes}
          onClose={() => {
            setShowForm(null);
            setEditingSource(null);
          }}
        />
      )}

      <div className="space-y-2">
        {sourcesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading sources...</p>
        ) : !sourcesQuery.data?.length ? (
          <p className="text-sm text-muted-foreground">No sources configured</p>
        ) : (
          sourcesQuery.data.map((source) => (
            <SourceCard key={source.id} source={source} onEdit={() => handleEdit(source)} />
          ))
        )}
      </div>
    </div>
  );
}
