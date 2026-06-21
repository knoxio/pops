import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * SourceManagementSection — CRUD UI for rotation source management.
 *
 * PRD-072 US-03
 */
import { CRUDManagementSection } from '@pops/ui';

import { unwrap } from '../media-api-helpers.js';
import { rotationListSources, rotationSourceTypes } from '../media-api/index.js';
import { SourceCard } from './source-management/SourceCard';
import { SourceForm } from './source-management/SourceForm';

import type { Source, SourceFormValues } from './source-management/types';

interface SourceTypesResult {
  types: string[];
}

function parseConfig(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toFormValues(source: Source): SourceFormValues {
  return {
    id: source.id,
    type: source.type,
    name: source.name,
    priority: source.priority,
    enabled: source.enabled === 1,
    config: parseConfig(source.config),
    syncIntervalHours: source.syncIntervalHours,
  };
}

async function fetchSources(): Promise<Source[]> {
  const { data } = await unwrap(await rotationListSources());
  return data.map((s) => ({
    id: s.id,
    type: s.type,
    name: s.name,
    priority: s.priority,
    enabled: s.enabled ? 1 : 0,
    config: JSON.stringify(s.config),
    lastSyncedAt: s.lastSyncedAt,
    syncIntervalHours: s.syncIntervalHours,
    candidateCount: s.candidateCount,
  }));
}

function useSourceQueries() {
  const sourcesQuery = useQuery<Source[]>({
    queryKey: ['media', 'rotation', 'listSources'],
    queryFn: fetchSources,
  });
  const sourceTypesQuery = useQuery<SourceTypesResult>({
    queryKey: ['media', 'rotation', 'sourceTypes'],
    queryFn: async () => (await unwrap(await rotationSourceTypes())).data,
  });
  return { sourcesQuery, sourceTypesQuery };
}

function SourceList({
  sources,
  isLoading,
  onEdit,
}: {
  sources: Source[] | undefined;
  isLoading: boolean;
  onEdit: (source: Source) => void;
}) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading sources...</p>;
  }
  if (!sources?.length) {
    return <p className="text-sm text-muted-foreground">No sources configured</p>;
  }
  return (
    <>
      {sources.map((source) => (
        <SourceCard
          key={source.id}
          source={source}
          onEdit={() => {
            onEdit(source);
          }}
        />
      ))}
    </>
  );
}

export function SourceManagementSection() {
  const { sourcesQuery, sourceTypesQuery } = useSourceQueries();

  const [showForm, setShowForm] = useState<'create' | 'edit' | null>(null);
  const [editingSource, setEditingSource] = useState<SourceFormValues | null>(null);

  const handleEdit = (source: Source) => {
    setEditingSource(toFormValues(source));
    setShowForm('edit');
  };

  const sourceTypes = sourceTypesQuery.data?.types ?? [];

  return (
    <CRUDManagementSection
      title="Sources"
      description="Configure where candidate movies come from"
      addLabel="Add Source"
      onAdd={() => {
        setEditingSource(null);
        setShowForm('create');
      }}
      showForm={!!showForm}
      form={
        showForm ? (
          <SourceForm
            mode={showForm}
            initialValues={showForm === 'edit' && editingSource ? editingSource : undefined}
            sourceTypes={sourceTypes}
            onClose={() => {
              setShowForm(null);
              setEditingSource(null);
            }}
          />
        ) : undefined
      }
    >
      <SourceList
        sources={sourcesQuery.data}
        isLoading={sourcesQuery.isLoading}
        onEdit={handleEdit}
      />
    </CRUDManagementSection>
  );
}
