import { useUIStore } from '@/store/uiStore';
import { X } from 'lucide-react';
import { useEffect } from 'react';

import { ChatPanel, useChatPageModel } from '@pops/app-cerebrum';
import { Button, cn } from '@pops/ui';

function useOverlayKeyboard(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);
}

function ChatOverlayPanel({ onClose }: { onClose: () => void }) {
  const model = useChatPageModel();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 shrink-0">
        <span className="text-sm font-semibold">Ego</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="min-h-[44px] min-w-[44px]"
          aria-label="Close chat"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ChatPanel model={model} className="flex-1 rounded-none border-0" />
    </div>
  );
}

export function ChatOverlay() {
  const open = useUIStore((state) => state.chatOverlayOpen);
  const setChatOverlayOpen = useUIStore((state) => state.setChatOverlayOpen);
  const onClose = () => setChatOverlayOpen(false);

  useOverlayKeyboard(open, onClose);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40" aria-hidden="true" onClick={onClose} />
      )}
      <aside
        className={cn(
          'fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-2xl flex-col bg-background shadow-2xl',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
        aria-label="Chat overlay"
        aria-hidden={!open}
        aria-modal={open}
        role="dialog"
      >
        {open && <ChatOverlayPanel onClose={onClose} />}
      </aside>
    </>
  );
}
