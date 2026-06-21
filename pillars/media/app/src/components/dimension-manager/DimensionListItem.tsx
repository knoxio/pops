import { Check, ChevronDown, ChevronUp, Pencil, X } from 'lucide-react';

import { Badge, Button, Input, Slider, Switch, Textarea } from '@pops/ui';

import type { Dimension, EditState } from './types';

export interface DimensionListItemProps {
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

function ReorderButtons({
  dim,
  idx,
  isLast,
  isPending,
  onReorder,
}: Pick<DimensionListItemProps, 'dim' | 'idx' | 'isLast' | 'isPending' | 'onReorder'>) {
  return (
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
  );
}

function EditView({
  editing,
  setEditing,
  onSaveEdit,
  isPending,
}: Pick<DimensionListItemProps, 'setEditing' | 'onSaveEdit' | 'isPending'> & {
  editing: EditState;
}) {
  return (
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
  );
}

function ReadView({
  dim,
  localWeight,
  onWeightDrag,
  onWeightCommit,
  isPending,
}: Pick<
  DimensionListItemProps,
  'dim' | 'localWeight' | 'onWeightDrag' | 'onWeightCommit' | 'isPending'
>) {
  return (
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
  );
}

export function DimensionListItem(props: DimensionListItemProps) {
  const { dim, editing, onStartEdit, onToggleActive, isPending } = props;
  const isEditing = editing?.id === dim.id;

  return (
    <div className="flex items-center gap-2 rounded-md border border-border p-2">
      <ReorderButtons {...props} />
      <div className="flex-1 min-w-0">
        {isEditing && editing ? <EditView {...props} editing={editing} /> : <ReadView {...props} />}
      </div>
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
      <Switch
        checked={dim.active}
        onCheckedChange={onToggleActive}
        disabled={isPending}
        aria-label={`${dim.active ? 'Deactivate' : 'Activate'} ${dim.name}`}
      />
    </div>
  );
}
