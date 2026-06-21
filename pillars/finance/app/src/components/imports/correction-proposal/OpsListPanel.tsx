import { useState } from 'react';

import { type AddMode, AddPanel } from './ops-list/AddPanel';
import { OpRow } from './ops-list/OpRow';

import type { CorrectionRule } from '../RulePicker';
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
  const [addMode, setAddMode] = useState<AddMode>(null);
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
            {props.ops.map((op) => (
              <OpRow
                key={op.clientId}
                op={op}
                selected={op.clientId === props.selectedClientId}
                disabled={props.disabled}
                onSelect={() => props.onSelect(op.clientId)}
                onDelete={() => props.onDelete(op.clientId)}
              />
            ))}
          </ul>
        )}
      </div>
      <div className="border-t p-2 space-y-2">
        <AddPanel
          addMode={addMode}
          setAddMode={setAddMode}
          disabled={props.disabled}
          onAddNewRule={props.onAddNewRule}
          onAddTargeted={props.onAddTargeted}
          excludeIds={props.excludeIds}
        />
      </div>
    </div>
  );
}
