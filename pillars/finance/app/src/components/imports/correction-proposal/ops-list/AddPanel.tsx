import { Plus, X } from 'lucide-react';

import { Button } from '@pops/ui';

import { type CorrectionRule, RulePicker } from '../../RulePicker';

export type AddMode = 'menu' | 'edit' | 'disable' | 'remove' | null;

interface AddMenuProps {
  onAddNewRule: () => void;
  setAddMode: (m: AddMode) => void;
}

function AddMenu({ onAddNewRule, setAddMode }: AddMenuProps) {
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="ghost"
        className="w-full justify-start"
        onClick={() => {
          onAddNewRule();
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
  );
}

interface PickerProps {
  mode: 'edit' | 'disable' | 'remove';
  excludeIds: ReadonlySet<string>;
  onAddTargeted: (kind: 'edit' | 'disable' | 'remove', rule: CorrectionRule) => void;
  setAddMode: (m: AddMode) => void;
}

function PickerPanel({ mode, excludeIds, onAddTargeted, setAddMode }: PickerProps) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground px-1">Pick a rule to {mode}</div>
      <RulePicker
        value={null}
        excludeIds={excludeIds}
        onChange={(rule) => {
          onAddTargeted(mode, rule);
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
  );
}

interface AddPanelProps {
  addMode: AddMode;
  setAddMode: (m: AddMode) => void;
  disabled: boolean;
  onAddNewRule: () => void;
  onAddTargeted: (kind: 'edit' | 'disable' | 'remove', rule: CorrectionRule) => void;
  excludeIds: ReadonlySet<string>;
}

export function AddPanel(props: AddPanelProps) {
  if (props.addMode === null) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="w-full justify-start"
        onClick={() => props.setAddMode('menu')}
        disabled={props.disabled}
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> Add operation
      </Button>
    );
  }
  if (props.addMode === 'menu') {
    return <AddMenu onAddNewRule={props.onAddNewRule} setAddMode={props.setAddMode} />;
  }
  return (
    <PickerPanel
      mode={props.addMode}
      excludeIds={props.excludeIds}
      onAddTargeted={props.onAddTargeted}
      setAddMode={props.setAddMode}
    />
  );
}
