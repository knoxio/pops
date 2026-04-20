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

interface ConfirmedViewProps {
  className?: string;
  busy: boolean;
  onUndo?: () => void | Promise<void>;
  undo: () => void;
  confirmedLabel: ReactNode;
  undoLabel: ReactNode;
}

function ConfirmedView({
  className,
  busy,
  onUndo,
  undo,
  confirmedLabel,
  undoLabel,
}: ConfirmedViewProps) {
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

function useConfirmFlow<Detail>(
  controlledConfirmed: boolean | undefined,
  onConfirm: (d: Detail) => void | Promise<void>,
  onUndo: (() => void | Promise<void>) | undefined
) {
  const [internalConfirmed, setInternalConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const isConfirmed = controlledConfirmed ?? internalConfirmed;

  const runWith = async (fn: () => void | Promise<void>, nextLocal: boolean) => {
    setBusy(true);
    try {
      await fn();
      if (controlledConfirmed === undefined) setInternalConfirmed(nextLocal);
    } finally {
      setBusy(false);
    }
  };

  return {
    isConfirmed,
    busy,
    confirm: async (detail: Detail) => runWith(() => onConfirm(detail), true),
    undo: async () => {
      if (!onUndo) return;
      await runWith(onUndo, false);
    },
  };
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
  const { isConfirmed, busy, confirm, undo } = useConfirmFlow(confirmed, onConfirm, onUndo);

  if (isConfirmed) {
    return (
      <ConfirmedView
        className={className}
        busy={busy}
        onUndo={onUndo}
        undo={undo}
        confirmedLabel={confirmedLabel}
        undoLabel={undoLabel}
      />
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
