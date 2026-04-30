import { useUIStore } from '@/store/uiStore';
import { Sparkles } from 'lucide-react';

import { Button, cn } from '@pops/ui';

export function ChatFab() {
  const open = useUIStore((state) => state.chatOverlayOpen);
  const toggleChatOverlay = useUIStore((state) => state.toggleChatOverlay);

  return (
    <Button
      onClick={toggleChatOverlay}
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
