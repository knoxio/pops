import { cn } from '../lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../primitives/dialog';

import type { ReactNode } from 'react';

export interface WorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /**
   * Number of columns for the content grid.
   * Omit (or set to undefined) to skip the grid wrapper and render children directly.
   */
  columns?: 2 | 3;
  /** Column template class override — use when you need non-equal columns */
  gridTemplate?: string;
  /** Main content — rendered inside a grid when `columns` is set, otherwise rendered directly */
  children: ReactNode;
  /** Content rendered above the grid/body (e.g. context strip) */
  header?: ReactNode;
  /** Footer action area */
  footer?: ReactNode;
  /** Extra panel rendered between grid and footer (e.g. reject/AI helper panel) */
  subpanel?: ReactNode;
  /** className applied to the DialogContent wrapper */
  className?: string;
}

const defaultGridTemplate: Record<2 | 3, string> = {
  2: 'grid-cols-[1fr_360px]',
  3: 'grid-cols-[260px_minmax(0,1fr)_360px]',
};

/**
 * Shell for large multi-panel workflow dialogs (correction proposal, manage rules, etc.).
 * Renders a wide dialog with header, optional context strip, N-column content grid
 * (or free-form body when columns is omitted), optional subpanel, and footer.
 */
export function WorkflowDialog({
  open,
  onOpenChange,
  title,
  description,
  columns,
  gridTemplate,
  children,
  header,
  footer,
  subpanel,
  className,
}: WorkflowDialogProps) {
  const useGrid = columns !== undefined;
  const templateClass = useGrid ? (gridTemplate ?? defaultGridTemplate[columns]) : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'w-(--size-dialog-xl) max-w-(--size-dialog-max-vw) md:max-w-(--size-dialog-max-vw) max-h-(--size-dialog-max-vh)',
          'flex flex-col gap-0 overflow-hidden p-0',
          className
        )}
      >
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {header}

        {useGrid ? (
          <div className={cn('grid gap-0 border-y flex-1 min-h-0', templateClass)}>{children}</div>
        ) : (
          children
        )}

        {subpanel}

        {footer && <DialogFooter className="px-6 py-4 border-t">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
