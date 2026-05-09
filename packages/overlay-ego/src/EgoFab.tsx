import { Sparkles } from 'lucide-react';

import { Button, cn } from '@pops/ui';

export interface EgoFabProps {
  open: boolean;
  onToggle: () => void;
}

/**
 * Floating action button that summons the Ego overlay. Shell renders one of
 * these in the chrome; the open/toggle state is owned by the shell's UI store.
 */
export function EgoFab({ open, onToggle }: EgoFabProps) {
  return (
    <Button
      onClick={onToggle}
      size="icon"
      shape="circle"
      className={cn(
        'fixed bottom-6 right-6 z-50 h-14 w-14 shadow-lg',
        'bg-sky-600 hover:bg-sky-500 text-white',
        'transition-transform duration-200',
        open && 'scale-90'
      )}
      aria-label={open ? 'Close chat' : 'Open chat'}
    >
      <Sparkles className="h-6 w-6" />
    </Button>
  );
}
