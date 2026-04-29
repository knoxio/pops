import { useUIStore } from '@/store/uiStore';
import { MessageSquare, X } from 'lucide-react';
import { useCallback, useEffect } from 'react';

/**
 * CerebrumChatOverlay — global floating action button + slide-in chat drawer.
 *
 * A fixed bottom-right FAB is visible on every page (rendered in RootLayout).
 * Clicking it opens a full-height slide-in panel containing the Ego ChatPanel.
 * The overlay is dismissible via:
 *   - The close button inside the panel
 *   - Pressing Escape
 *   - Clicking the backdrop
 *
 * State lives in the UI store so any page can programmatically open the overlay
 * (e.g. the Media sparkle FAB).
 *
 * The ChatPanel and its view-model hook are lazy-imported so they are only
 * bundled/evaluated when the overlay is first opened.
 */
import { ChatPanel, useChatPageModel } from '@pops/app-cerebrum';
import { Button, cn } from '@pops/ui';

/** Inner content — only rendered when overlay is open to avoid mounting the
 * tRPC queries until the user actually opens chat. */
function ChatOverlayContent({ onClose }: { onClose: () => void }) {
  const model = useChatPageModel();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-app-accent" />
          <span className="text-sm font-semibold">Ego</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8 min-h-0 min-w-0"
          aria-label="Close chat"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Chat panel fills remaining height */}
      <div className="flex-1 min-h-0">
        <ChatPanel model={model} className="h-full rounded-none border-0" />
      </div>
    </div>
  );
}

export function CerebrumChatOverlay() {
  const isOpen = useUIStore((state) => state.cerebrumChatOpen);
  const toggle = useUIStore((state) => state.toggleCerebrumChat);
  const setOpen = useUIStore((state) => state.setCerebrumChatOpen);

  const handleClose = useCallback(() => setOpen(false), [setOpen]);

  /* Dismiss on Escape */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  return (
    <>
      {/* Floating action button — always visible */}
      <button
        type="button"
        onClick={toggle}
        aria-label="Open Ego chat"
        aria-expanded={isOpen}
        className={cn(
          'fixed bottom-6 right-6 z-50',
          'flex h-14 w-14 items-center justify-center rounded-full',
          'bg-app-accent text-white shadow-lg shadow-app-accent/30',
          'hover:bg-app-accent/90 active:scale-95',
          'transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2',
          isOpen && 'scale-95 opacity-90'
        )}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          aria-hidden="true"
          onClick={handleClose}
        />
      )}

      {/* Slide-in panel */}
      <div
        className={cn(
          'fixed right-0 top-0 z-40 h-screen w-full max-w-2xl',
          'bg-background shadow-2xl',
          'transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
        aria-modal="true"
        aria-label="Ego chat panel"
        role="dialog"
      >
        {isOpen && <ChatOverlayContent onClose={handleClose} />}
      </div>
    </>
  );
}
