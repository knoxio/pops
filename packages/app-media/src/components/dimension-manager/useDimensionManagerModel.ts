import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { unwrap } from '../../media-api-helpers.js';
import { comparisonsListDimensions } from '../../media-api/index.js';
import { reorderDimension, useDimensionMutations } from './useDimensionMutations';

import type { Dimension, EditState } from './types';

export interface DimensionManagerModel {
  dimensions: Dimension[];
  sorted: Dimension[];
  isLoading: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  showAddForm: boolean;
  setShowAddForm: (v: boolean) => void;
  addName: string;
  setAddName: (v: string) => void;
  addDescription: string;
  setAddDescription: (v: string) => void;
  editing: EditState | null;
  setEditing: (e: EditState | null) => void;
  localWeights: Map<number, number>;
  isPending: boolean;
  isCreatePending: boolean;
  handleAdd: () => void;
  handleToggleActive: (dim: Dimension) => void;
  handleStartEdit: (dim: Dimension) => void;
  handleSaveEdit: () => void;
  handleWeightDrag: (dimId: number, value: number) => void;
  handleWeightCommit: (dim: Dimension, value: number) => void;
  handleReorder: (dim: Dimension, direction: 'up' | 'down') => void;
}

interface RawDimension {
  id: number;
  name: string;
  description: string | null;
  active: boolean | number;
  sortOrder: number;
  weight: number | null;
}

function normalizeDimensions(raw: ReadonlyArray<RawDimension>): Dimension[] {
  return raw.map((d) => ({
    ...d,
    active: Boolean(d.active),
    weight: d.weight ?? 1.0,
  }));
}

function useDimensionsQuery(open: boolean) {
  const { data, isLoading } = useQuery<{ data: ReadonlyArray<RawDimension> }>({
    queryKey: ['media', 'comparisons', 'listDimensions'],
    queryFn: async () => unwrap(await comparisonsListDimensions()),
    enabled: open,
  });
  return { dimensions: normalizeDimensions(data?.data ?? []), isLoading };
}

export function useDimensionManagerModel(): DimensionManagerModel {
  const [open, setOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [editing, setEditing] = useState<EditState | null>(null);

  const { dimensions, isLoading } = useDimensionsQuery(open);

  const mutations = useDimensionMutations({
    dimensionsLength: dimensions.length,
    addName,
    addDescription,
    editing,
    setEditing,
    setAddName,
    setAddDescription,
    setShowAddForm,
  });

  const handleReorder = useCallback(
    (dim: Dimension, direction: 'up' | 'down') => {
      reorderDimension(dimensions, dim, direction, mutations.updateMutation.mutate);
    },
    [dimensions, mutations.updateMutation]
  );

  const sorted = [...dimensions].toSorted((a, b) => a.sortOrder - b.sortOrder);

  return {
    dimensions,
    sorted,
    isLoading,
    open,
    setOpen,
    showAddForm,
    setShowAddForm,
    addName,
    setAddName,
    addDescription,
    setAddDescription,
    editing,
    setEditing,
    localWeights: mutations.localWeights,
    isPending: mutations.updateMutation.isPending,
    isCreatePending: mutations.createMutation.isPending,
    handleAdd: mutations.handleAdd,
    handleToggleActive: mutations.handleToggleActive,
    handleStartEdit: mutations.handleStartEdit,
    handleSaveEdit: mutations.handleSaveEdit,
    handleWeightDrag: mutations.handleWeightDrag,
    handleWeightCommit: mutations.handleWeightCommit,
    handleReorder,
  };
}
