import { useUIStore } from '@/store/uiStore';

import { EgoOverlay } from '@pops/overlay-ego';

/**
 * Shell wiring for the Ego overlay (PRD-099).
 *
 * The overlay component, panel, header, keyboard handlers and chat hook all
 * live in `@pops/overlay-ego`. This file only binds the open/close state to
 * the shell's `useUIStore` so the FAB and overlay share state.
 */
export function ChatOverlay() {
  const open = useUIStore((state) => state.chatOverlayOpen);
  const setChatOverlayOpen = useUIStore((state) => state.setChatOverlayOpen);

  return <EgoOverlay open={open} onClose={() => setChatOverlayOpen(false)} />;
}
