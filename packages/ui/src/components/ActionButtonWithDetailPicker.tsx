/**
 * ActionButtonWithDetailPicker — primary action button with an optional
 * popover for picking details (date, amount, note) and an undo slot.
 *
 * The "confirmed" state swaps the action into an "Undo" affordance; an
 * explicit `onUndo` puts the button back into its unconfirmed state.
 */
import { Check } from 'lucide-react';
import { type ComponentType, type ReactNode, useState } from 'react';

import { cn } from '../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';
import { Button, type ButtonProps } from './Button';

type LucideIcon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

export interface ActionButtonWithDetailPickerProps<Detail> {
  label: ReactNode;
  icon?: LucideIcon;
  /** Content rendered in the picker popover. */
  pickerContent: (args: { close: () => void; confirm: (detail: Detail) => void }) => ReactNode;
  /** Final confirm handler. */
  onConfirm: (detail: Detail) => void | Promise<void>;
  /** If provided, renders an "Undo" action once confirmed. */
  onUndo?: () => void | Promise<void>;
  /** Externally controlled confirmed state. */
  confirmed?: boolean;
  confirmedLabel?: ReactNode;
  undoLabel?: ReactNode;
  buttonVariant?: ButtonProps['variant'];
  buttonSize?: ButtonProps['size'];
  disabled?: boolean;
  className?: string;
}

export function ActionButtonWithDetailPicker<Detail>({
  label,
  icon: Icon,
  pickerContent,
  onConfirm,
  onUndo,
  confirmed,
  confirmedLabel = 'Done',
  undoLabel = 'Undo',
  buttonVariant = 'default',
  buttonSize = 'default',
  disabled,
  className,
}: ActionButtonWithDetailPickerProps<Detail>) {
  const [open, setOpen] = useState(false);
  const [internalConfirmed, setInternalConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const isConfirmed = confirmed ?? internalConfirmed;

  const confirm = async (detail: Detail) => {
    setBusy(true);
    try {
      await onConfirm(detail);
      if (confirmed === undefined) setInternalConfirmed(true);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!onUndo) return;
    setBusy(true);
    try {
      await onUndo();
      if (confirmed === undefined) setInternalConfirmed(false);
    } finally {
      setBusy(false);
    }
  };

  if (isConfirmed) {
    return (
      <div className={cn('inline-flex items-center gap-2', className)}>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
          <Check className="h-3.5 w-3.5" aria-hidden /> {confirmedLabel}
        </span>
        {onUndo ? (
          <Button variant="ghost" size="sm" loading={busy} onClick={undo}>
            {undoLabel}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={buttonVariant}
          size={buttonSize}
          prefix={Icon ? <Icon className="h-4 w-4" aria-hidden /> : undefined}
          disabled={disabled}
          loading={busy}
          className={className}
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px]" align="end">
        {pickerContent({ close: () => setOpen(false), confirm })}
      </PopoverContent>
    </Popover>
  );
}
