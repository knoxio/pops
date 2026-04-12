import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@pops/ui";
import { Input } from "@pops/ui";
import { Label } from "@pops/ui";
import { Button } from "@pops/ui";
import { useImportStore } from "../../store/importStore";

interface EntityCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEntityCreated: (entity: { entityId: string; entityName: string }) => void;
  suggestedName?: string;
  /** DB entities for uniqueness check */
  dbEntities?: Array<{ name: string }>;
}

/**
 * Dialog for creating a new entity during import.
 * Writes to the local pending entity store instead of the server.
 */
export function EntityCreateDialog({
  open,
  onOpenChange,
  onEntityCreated,
  suggestedName = "",
  dbEntities = [],
}: EntityCreateDialogProps) {
  const [name, setName] = useState(suggestedName);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addPendingEntity = useImportStore((s) => s.addPendingEntity);

  // Sync name with suggestedName when dialog opens or suggestedName changes
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
        const entity = addPendingEntity({ name: trimmed, type: "company" }, dbEntities);
        onEntityCreated({ entityId: entity.tempId, entityName: entity.name });
        onOpenChange(false);
        setName("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create entity");
      }
    },
    [name, addPendingEntity, dbEntities, onEntityCreated, onOpenChange]
  );

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      onOpenChange(newOpen);
      if (!newOpen) {
        setName("");
        setTouched(false);
        setError(null);
      }
    },
    [onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Entity</DialogTitle>
            <DialogDescription>
              Add a new merchant or payee. It will be committed with the import.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="entity-name">Entity Name</Label>
              <Input
                id="entity-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setTouched(true);
                  setError(null);
                }}
                onBlur={() => setTouched(true)}
                placeholder="e.g., Woolworths"
                autoFocus
              />
              {touched && !name.trim() && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">Name is required</p>
              )}
            </div>

            {error && (
              <div className="p-3 text-sm text-red-700 bg-red-100 dark:bg-red-900 dark:text-red-200 rounded-md">
                <p>{error}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Create Entity
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
