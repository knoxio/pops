import { Settings, X } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';

import { Button, cn } from '@pops/ui';

import { ChatPanel } from './chat-components/ChatPanel';
import { useChatPageModel } from './chat-hooks/useChatPageModel';

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

function EgoOverlayPanel({ onClose }: { onClose: () => void }) {
  const model = useChatPageModel();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 shrink-0 gap-2">
        <span className="text-sm font-semibold">Ego</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="min-h-[44px] min-w-[44px]"
            aria-label="Open Ego settings"
          >
            <Link to="/settings/ego">
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
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
      </div>
      <ChatPanel model={model} className="flex-1 rounded-none border-0" />
    </div>
  );
}

export interface EgoOverlayProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Floating Ego chat panel — overlay surface (PRD-099).
 *
 * Summons over any shell page; shares conversation state with /cerebrum/chat
 * because both consume the same `useChatPageModel` hook (which is bound to
 * tRPC queries by `conversationId`).
 */
export function EgoOverlay({ open, onClose }: EgoOverlayProps) {
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
        {open && <EgoOverlayPanel onClose={onClose} />}
      </aside>
    </>
  );
}
