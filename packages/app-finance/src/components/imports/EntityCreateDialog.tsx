import { useState, useCallback, useEffect } from "react";
import { trpc } from "../../lib/trpc";
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

interface EntityCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEntityCreated: (entity: { entityId: string; entityName: string }) => void;
  suggestedName?: string;
}

/**
 * Dialog for creating a new entity during import
 */
export function EntityCreateDialog({
  open,
  onOpenChange,
  onEntityCreated,
  suggestedName = "",
}: EntityCreateDialogProps) {
  const [name, setName] = useState(suggestedName);
  const [touched, setTouched] = useState(false);

  // Sync name with suggestedName when dialog opens or suggestedName changes
  useEffect(() => {
    if (open) {
      setName(suggestedName);
      setTouched(false);
    }
  }, [open, suggestedName]);

  const utils = trpc.useUtils();
  const createEntityMutation = trpc.finance.imports.createEntity.useMutation({
    onSuccess: (data) => {
      // Refresh entities list
      utils.core.entities.list.invalidate();
      onEntityCreated(data);
      onOpenChange(false);
      setName("");
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      if (!name.trim()) {
        return;
      }

      createEntityMutation.mutate({ name: name.trim() });
    },
    [name, createEntityMutation]
  );

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!createEntityMutation.isPending) {
        onOpenChange(newOpen);
        if (!newOpen) {
          setName("");
          setTouched(false);
          createEntityMutation.reset();
        }
      }
    },
    [onOpenChange, createEntityMutation]
  );

  const handleRetry = useCallback(() => {
    createEntityMutation.reset();
    createEntityMutation.mutate({ name: name.trim() });
  }, [name, createEntityMutation]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Entity</DialogTitle>
            <DialogDescription>
              Add a new merchant or payee to your entities database.
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
                }}
                onBlur={() => setTouched(true)}
                placeholder="e.g., Woolworths"
                disabled={createEntityMutation.isPending}
                autoFocus
              />
              {touched && !name.trim() && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">Name is required</p>
              )}
            </div>

            {createEntityMutation.isError && (
              <div className="p-3 text-sm text-red-700 bg-red-100 dark:bg-red-900 dark:text-red-200 rounded-md">
                <p>{createEntityMutation.error.message}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={handleRetry}
                >
                  Retry
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createEntityMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || createEntityMutation.isPending}>
              {createEntityMutation.isPending ? "Creating..." : "Create Entity"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
