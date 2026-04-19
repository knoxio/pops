import { Check, ChevronDown, ChevronUp, Pencil, Plus, Settings, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
/**
 * DimensionManager — CRUD panel for comparison dimensions.
 *
 * Accessed from CompareArenaPage via a gear icon. Lets users add,
 * edit, deactivate, and reorder comparison dimensions.
 */
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Slider,
  Switch,
  Textarea,
} from '@pops/ui';

import { CRUDManagementSection } from './CRUDManagementSection';

interface Dimension {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  weight: number;
}

/** Inline edit state for a single dimension. */
interface EditState {
  id: number;
  name: string;
  description: string;
}

interface DimensionListItemProps {
  dim: Dimension;
  idx: number;
  isLast: boolean;
  editing: EditState | null;
  setEditing: (e: EditState | null) => void;
  onSaveEdit: () => void;
  onReorder: (direction: 'up' | 'down') => void;
  onStartEdit: () => void;
  onToggleActive: () => void;
  onWeightDrag: (value: number) => void;
  onWeightCommit: (value: number) => void;
  localWeight: number;
  isPending: boolean;
}

function DimensionListItem({
  dim,
  idx,
  isLast,
  editing,
  setEditing,
  onSaveEdit,
  onReorder,
  onStartEdit,
  onToggleActive,
  onWeightDrag,
  onWeightCommit,
  localWeight,
  isPending,
}: DimensionListItemProps) {
  const isEditing = editing?.id === dim.id;

  return (
    <div className="flex items-center gap-2 rounded-md border border-border p-2">
      {/* Reorder buttons */}
      <div className="flex flex-col">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            onReorder('up');
          }}
          disabled={idx === 0 || isPending}
          className="p-0.5 h-auto w-auto text-muted-foreground hover:text-foreground"
          aria-label={`Move ${dim.name} up`}
        >
          <ChevronUp className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            onReorder('down');
          }}
          disabled={isLast || isPending}
          className="p-0.5 h-auto w-auto text-muted-foreground hover:text-foreground"
          aria-label={`Move ${dim.name} down`}
        >
          <ChevronDown className="h-3 w-3" />
        </Button>
      </div>

      {/* Name & description (editable) */}
      <div className="flex-1 min-w-0">
        {isEditing && editing ? (
          <div className="space-y-1">
            <Input
              value={editing.name}
              onChange={(e) => {
                setEditing({ ...editing, name: e.target.value });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit();
                if (e.key === 'Escape') setEditing(null);
              }}
              className="h-7 text-sm"
              autoFocus
            />
            <Textarea
              value={editing.description}
              onChange={(e) => {
                setEditing({ ...editing, description: e.target.value });
              }}
              rows={1}
              className="resize-none text-sm"
              placeholder="Description"
            />
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2"
                onClick={onSaveEdit}
                disabled={isPending}
              >
                <Check className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2"
                onClick={() => {
                  setEditing(null);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate">{dim.name}</span>
              {!dim.active && (
                <Badge variant="secondary" className="text-xs">
                  Inactive
                </Badge>
              )}
            </div>
            {dim.description && (
              <p className="text-xs text-muted-foreground truncate">{dim.description}</p>
            )}
            {/* Weight slider */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">
                Weight: {localWeight.toFixed(1)}
              </span>
              <Slider
                min={0.1}
                max={3}
                step={0.1}
                value={[localWeight]}
                onValueChange={([v]) => {
                  if (v !== undefined) onWeightDrag(v);
                }}
                onValueCommit={([v]) => {
                  if (v !== undefined) onWeightCommit(v);
                }}
                disabled={isPending}
                className="w-24"
                aria-label={`Weight for ${dim.name}`}
              />
            </div>
          </div>
        )}
      </div>

      {/* Edit button */}
      {!isEditing && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onStartEdit}
          className="p-1 h-auto w-auto text-muted-foreground hover:text-foreground"
          aria-label={`Edit ${dim.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* Active toggle */}
      <Switch
        checked={dim.active}
        onCheckedChange={onToggleActive}
        disabled={isPending}
        aria-label={`${dim.active ? 'Deactivate' : 'Activate'} ${dim.name}`}
      />
    </div>
  );
}

export function DimensionManager() {
  const [open, setOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [editing, setEditing] = useState<EditState | null>(null);

  const utils = trpc.useUtils();

  const { data: dimensionsData, isLoading } = trpc.media.comparisons.listDimensions.useQuery(
    undefined,
    {
      enabled: open,
    }
  );

  const dimensions: Dimension[] = (dimensionsData?.data ?? []).map(
    (d: {
      id: number;
      name: string;
      description: string | null;
      active: boolean | number;
      sortOrder: number;
      weight: number;
    }) => ({
      ...d,
      active: Boolean(d.active),
      weight: d.weight ?? 1.0,
    })
  );

  const createMutation = trpc.media.comparisons.createDimension.useMutation({
    onSuccess: () => {
      utils.media.comparisons.listDimensions.invalidate();
      setAddName('');
      setAddDescription('');
      toast.success('Dimension created');
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const updateMutation = trpc.media.comparisons.updateDimension.useMutation({
    onSuccess: () => {
      utils.media.comparisons.listDimensions.invalidate();
      setEditing(null);
      toast.success('Dimension updated');
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const handleAdd = useCallback(() => {
    const name = addName.trim();
    if (!name) return;
    createMutation.mutate({
      name,
      description: addDescription.trim() || null,
      sortOrder: dimensions.length,
    });
    setShowAddForm(false);
  }, [addName, addDescription, dimensions.length, createMutation]);

  const handleToggleActive = useCallback(
    (dim: Dimension) => {
      updateMutation.mutate({
        id: dim.id,
        data: { active: !dim.active },
      });
    },
    [updateMutation]
  );

  const handleStartEdit = useCallback((dim: Dimension) => {
    setEditing({
      id: dim.id,
      name: dim.name,
      description: dim.description ?? '',
    });
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    updateMutation.mutate({
      id: editing.id,
      data: {
        name,
        description: editing.description.trim() || null,
      },
    });
  }, [editing, updateMutation]);

  // Local weight state for smooth slider dragging (avoids server round-trip jitter)
  const [localWeights, setLocalWeights] = useState<Map<number, number>>(new Map());

  const handleWeightDrag = useCallback((dimId: number, value: number) => {
    setLocalWeights((prev) => new Map(prev).set(dimId, value));
  }, []);

  const handleWeightCommit = useCallback(
    (dim: Dimension, value: number) => {
      updateMutation.mutate(
        { id: dim.id, data: { weight: value } },
        {
          onSettled: () => {
            setLocalWeights((prev) => {
              const next = new Map(prev);
              next.delete(dim.id);
              return next;
            });
          },
        }
      );
    },
    [updateMutation]
  );

  const handleReorder = useCallback(
    (dim: Dimension, direction: 'up' | 'down') => {
      const sorted = [...dimensions].toSorted((a, b) => a.sortOrder - b.sortOrder);
      const idx = sorted.findIndex((d) => d.id === dim.id);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return;

      const swapTarget = sorted[swapIdx];
      if (!swapTarget) return;
      // Swap sort orders
      updateMutation.mutate(
        { id: dim.id, data: { sortOrder: swapTarget.sortOrder } },
        {
          onSuccess: () => {
            updateMutation.mutate({
              id: swapTarget.id,
              data: { sortOrder: dim.sortOrder },
            });
          },
        }
      );
    },
    [dimensions, updateMutation]
  );

  const sorted = [...dimensions].toSorted((a, b) => a.sortOrder - b.sortOrder);

  const addForm = (
    <div className="space-y-2">
      <Input
        placeholder="Dimension name"
        value={addName}
        onChange={(e) => {
          setAddName(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleAdd();
        }}
      />
      <Textarea
        placeholder="Description (optional)"
        value={addDescription}
        onChange={(e) => {
          setAddDescription(e.target.value);
        }}
        rows={2}
        className="resize-none"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!addName.trim() || createMutation.isPending}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Dimension
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setShowAddForm(false);
            setAddName('');
            setAddDescription('');
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Manage dimensions">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md p-0">
        {/* Hidden title for accessibility */}
        <DialogHeader className="sr-only">
          <DialogTitle>Comparison Dimensions</DialogTitle>
        </DialogHeader>

        <CRUDManagementSection
          title="Comparison Dimensions"
          addLabel="Add Dimension"
          onAdd={() => {
            setAddName('');
            setAddDescription('');
            setShowAddForm(true);
          }}
          showForm={showAddForm}
          form={addForm}
        >
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No dimensions yet. Add one above.
            </p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {sorted.map((dim, idx) => (
                <DimensionListItem
                  key={dim.id}
                  dim={dim}
                  idx={idx}
                  isLast={idx === sorted.length - 1}
                  editing={editing}
                  setEditing={setEditing}
                  onSaveEdit={handleSaveEdit}
                  onReorder={(direction) => {
                    handleReorder(dim, direction);
                  }}
                  onStartEdit={() => {
                    handleStartEdit(dim);
                  }}
                  onToggleActive={() => {
                    handleToggleActive(dim);
                  }}
                  onWeightDrag={(v) => {
                    handleWeightDrag(dim.id, v);
                  }}
                  onWeightCommit={(v) => {
                    handleWeightCommit(dim, v);
                  }}
                  localWeight={localWeights.get(dim.id) ?? dim.weight}
                  isPending={updateMutation.isPending}
                />
              ))}
            </div>
          )}
        </CRUDManagementSection>
      </DialogContent>
    </Dialog>
  );
}
