import { Undo2 } from 'lucide-react';

export const UNDO_DELAY_MS = 5000;

/** Toast with a shrinking progress bar and undo button. */
export function UndoToast({ toastId, onUndo }: { toastId: string | number; onUndo: () => void }) {
  void toastId;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-4 py-3 w-72">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-foreground">Comparison deleted</span>
        <button
          onClick={onUndo}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Undo
        </button>
      </div>
      <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary animate-shrink-bar"
          style={
            {
              '--shrink-duration': `${UNDO_DELAY_MS}ms`,
            } as React.CSSProperties
          }
        />
      </div>
    </div>
  );
}
