import { Badge, Button } from '@pops/ui';
import { Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { opKindBadgeVariant, opKindLabel, opSummary } from '../lib/correction-utils';
import { type CorrectionRule, RulePicker } from '../RulePicker';
import type { LocalOp } from './types';

export function OpsListPanel(props: {
  ops: LocalOp[];
  selectedClientId: string | null;
  onSelect: (clientId: string) => void;
  onDelete: (clientId: string) => void;
  onAddNewRule: () => void;
  onAddTargeted: (kind: 'edit' | 'disable' | 'remove', rule: CorrectionRule) => void;
  excludeIds: ReadonlySet<string>;
  disabled: boolean;
}) {
  const [addMode, setAddMode] = useState<'menu' | 'edit' | 'disable' | 'remove' | null>(null);
  return (
    <div className="flex flex-col min-h-0 border-r">
      <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b">
        Operations ({props.ops.length})
      </div>
      <div className="flex-1 overflow-auto">
        {props.ops.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            ChangeSet is empty. Add an operation below.
          </div>
        ) : (
          <ul className="divide-y">
            {props.ops.map((op) => {
              const selected = op.clientId === props.selectedClientId;
              return (
                <li
                  key={op.clientId}
                  className={`px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                    selected ? 'bg-muted' : ''
                  }`}
                  onClick={() => props.onSelect(op.clientId)}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={opKindBadgeVariant(op.kind)}
                          className="text-[10px] h-4 px-1.5"
                        >
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
                        props.onDelete(op.clientId);
                      }}
                      disabled={props.disabled}
                      aria-label="Delete operation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="border-t p-2 space-y-2">
        {addMode === null && (
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-start"
            onClick={() => setAddMode('menu')}
            disabled={props.disabled}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add operation
          </Button>
        )}
        {addMode === 'menu' && (
          <div className="space-y-1">
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                props.onAddNewRule();
                setAddMode(null);
              }}
            >
              Add new rule
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => setAddMode('edit')}
            >
              Edit existing rule…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => setAddMode('disable')}
            >
              Disable existing rule…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => setAddMode('remove')}
            >
              Remove existing rule…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              onClick={() => setAddMode(null)}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Cancel
            </Button>
          </div>
        )}
        {(addMode === 'edit' || addMode === 'disable' || addMode === 'remove') && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground px-1">Pick a rule to {addMode}</div>
            <RulePicker
              value={null}
              excludeIds={props.excludeIds}
              onChange={(rule) => {
                props.onAddTargeted(addMode, rule);
                setAddMode(null);
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              onClick={() => setAddMode(null)}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
