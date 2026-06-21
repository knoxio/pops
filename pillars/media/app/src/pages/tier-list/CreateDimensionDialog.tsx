/**
 * CreateDimensionDialog — collects name + description, fires onSubmit.
 *
 * Always-controlled inputs: `value` + `onChange` are passed on every render so
 * post-#2155 controlled-mode invariants hold for `TextInput` (it switches
 * between controlled/uncontrolled based on the presence of `value` and we do
 * not want to flip mid-life). No checkboxes, so the post-#2175 Controller
 * wiring rules do not apply here.
 */
import { useEffect, useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
  TextInput,
} from '@pops/ui';

interface CreateDimensionDialogProps {
  /** Whether the dialog is currently open. */
  open: boolean;
  /** Called when the user requests to close (overlay click, escape, cancel). */
  onOpenChange: (open: boolean) => void;
  /** Submit handler — receives a trimmed name and an optional description. */
  onSubmit: (input: { name: string; description: string | null }) => void;
  /** Whether the parent mutation is in flight; disables submit while true. */
  isPending: boolean;
}

interface FormFieldsProps {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  onEnter: () => void;
}

function FormFields({ name, setName, description, setDescription, onEnter }: FormFieldsProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium" htmlFor="dimension-name">
          Name
        </label>
        <TextInput
          id="dimension-name"
          placeholder="e.g. Cinematography"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter();
          }}
          autoFocus
        />
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="dimension-description">
          Description
        </label>
        <Textarea
          id="dimension-description"
          placeholder="Optional — describe what this dimension measures"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="resize-none"
        />
      </div>
    </div>
  );
}

/**
 * Hook owns the dialog's transient form state. Resets on close so a re-open
 * starts empty without stomping an in-flight mutation's values.
 */
function useDimensionFormState(open: boolean) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
    }
  }, [open]);

  return { name, setName, description, setDescription };
}

export function CreateDimensionDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: CreateDimensionDialogProps) {
  const { name, setName, description, setDescription } = useDimensionFormState(open);
  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ name: trimmedName, description: description.trim() || null });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New dimension</DialogTitle>
          <DialogDescription>
            Dimensions are axes along which you rank media — e.g. Cinematography or Soundtrack.
          </DialogDescription>
        </DialogHeader>
        <FormFields
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          onEnter={handleSubmit}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isPending ? 'Creating…' : 'Create dimension'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
