import { Plus, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@pops/ui';

interface AddLocationFormProps {
  onSave: (name: string) => void;
  onCancel: () => void;
}

function AddLocationForm({ onSave, onCancel }: AddLocationFormProps) {
  const [name, setName] = useState('');
  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        placeholder="Location name…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) onSave(name.trim());
          if (e.key === 'Escape') onCancel();
        }}
        className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
        autoFocus
      />
      <Button
        size="sm"
        variant="default"
        onClick={() => name.trim() && onSave(name.trim())}
        disabled={!name.trim()}
        className="h-7 px-2 text-xs"
      >
        Add
      </Button>
    </div>
  );
}

interface PickerFooterProps {
  value?: string | null;
  canCreate: boolean;
  onClear: () => void;
  onCreateLocation: (name: string) => void;
}

export function PickerFooter({ value, canCreate, onClear, onCreateLocation }: PickerFooterProps) {
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="border-t p-2 flex flex-col gap-1">
      {value && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          prefix={<X className="h-3.5 w-3.5" />}
          onClick={onClear}
        >
          Clear selection
        </Button>
      )}
      {canCreate && !showAddForm && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          prefix={<Plus className="h-3.5 w-3.5" />}
          onClick={() => setShowAddForm(true)}
        >
          Add location
        </Button>
      )}
      {canCreate && showAddForm && (
        <AddLocationForm
          onSave={(name) => {
            onCreateLocation(name);
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}
