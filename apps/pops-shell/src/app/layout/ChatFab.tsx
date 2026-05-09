import { useUIStore } from '@/store/uiStore';

import { EgoFab } from '@pops/overlay-ego';

/**
 * Shell wiring for the Ego overlay's floating action button (PRD-099).
 * Visual + behaviour live in `@pops/overlay-ego`; this file binds toggle
 * state to the shell's `useUIStore`.
 */
export function ChatFab() {
  const open = useUIStore((state) => state.chatOverlayOpen);
  const toggleChatOverlay = useUIStore((state) => state.toggleChatOverlay);

  return <EgoFab open={open} onToggle={toggleChatOverlay} />;
}
