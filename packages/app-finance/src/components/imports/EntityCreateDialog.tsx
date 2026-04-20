import { useCallback, useEffect, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Button,
} from '@pops/ui';

import { useImportStore } from '../../store/importStore';

interface EntityCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEntityCreated: (entity: { entityId: string; entityName: string }) => void;
  suggestedName?: string;
  /** DB entities for uniqueness check */
  dbEntities?: Array<{ name: string }>;
}

interface NameFieldProps {
  name: string;
  touched: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
}

function NameField({ name, touched, onChange, onBlur }: NameFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="entity-name">Entity Name</Label>
      <Input
        id="entity-name"
        value={name}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="e.g., Woolworths"
        autoFocus
      />
      {touched && !name.trim() && <p className="text-xs text-destructive mt-1">Name is required</p>}
    </div>
  );
}

interface DialogBodyProps {
  name: string;
  touched: boolean;
  error: string | null;
  onNameChange: (value: string) => void;
  onNameBlur: () => void;
}

function DialogBody({ name, touched, error, onNameChange, onNameBlur }: DialogBodyProps) {
  return (
    <div className="py-4 space-y-4">
      <NameField name={name} touched={touched} onChange={onNameChange} onBlur={onNameBlur} />
      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 dark:text-destructive/40 rounded-md">
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}

function useEntityCreate(props: EntityCreateDialogProps) {
  const { open, onOpenChange, onEntityCreated, suggestedName = '', dbEntities = [] } = props;
  const [name, setName] = useState(suggestedName);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addPendingEntity = useImportStore((s) => s.addPendingEntity);

  useEffect(() => {
    if (open) {
      setName(suggestedName);
      setTouched(false);
      setError(null);
    }
  }, [open, suggestedName]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        const entity = addPendingEntity({ name: trimmed, type: 'company' }, dbEntities);
        onEntityCreated({ entityId: entity.tempId, entityName: entity.name });
        onOpenChange(false);
        setName('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create entity');
      }
    },
    [name, addPendingEntity, dbEntities, onEntityCreated, onOpenChange]
  );

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      onOpenChange(newOpen);
      if (!newOpen) {
        setName('');
        setTouched(false);
        setError(null);
      }
    },
    [onOpenChange]
  );

  const handleNameChange = useCallback((v: string) => {
    setName(v);
    setTouched(true);
    setError(null);
  }, []);

  return {
    name,
    touched,
    error,
    handleSubmit,
    handleOpenChange,
    handleNameChange,
    handleNameBlur: () => setTouched(true),
  };
}

/**
 * Dialog for creating a new entity during import.
 * Writes to the local pending entity store instead of the server.
 */
export function EntityCreateDialog(props: EntityCreateDialogProps) {
  const state = useEntityCreate(props);

  return (
    <Dialog open={props.open} onOpenChange={state.handleOpenChange}>
      <DialogContent>
        <form onSubmit={state.handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Entity</DialogTitle>
            <DialogDescription>
              Add a new merchant or payee. It will be committed with the import.
            </DialogDescription>
          </DialogHeader>
          <DialogBody
            name={state.name}
            touched={state.touched}
            error={state.error}
            onNameChange={state.handleNameChange}
            onNameBlur={state.handleNameBlur}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => state.handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!state.name.trim()}>
              Create Entity
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
