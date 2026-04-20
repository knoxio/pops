import { Trash2 } from 'lucide-react';

import { Badge } from '@pops/ui';

import { opKindBadgeVariant, opKindLabel, opSummary } from '../../lib/correction-utils';

import type { LocalOp } from '../types';

interface OpRowProps {
  op: LocalOp;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function OpRow({ op, selected, disabled, onSelect, onDelete }: OpRowProps) {
  return (
    <li
      className={`px-3 py-2 cursor-pointer hover:bg-muted/50 ${selected ? 'bg-muted' : ''}`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5">
            <Badge variant={opKindBadgeVariant(op.kind)} className="text-[10px] h-4 px-1.5">
              {opKindLabel(op.kind)}
            </Badge>
            {op.dirty && (
              <span
                className="h-1.5 w-1.5 rounded-full bg-amber-500"
                title="Unsaved edits — preview stale"
              />
            )}
          </div>
          <div className="text-xs truncate" title={opSummary(op)}>
            {opSummary(op)}
          </div>
        </div>
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive p-1"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={disabled}
          aria-label="Delete operation"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
