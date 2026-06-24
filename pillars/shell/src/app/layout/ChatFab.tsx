import { useUIStore } from '@/store/uiStore';

import { EgoFab } from '@pops/overlay-ego';

/**
 * Shell wiring for the Ego overlay's floating action button. Visual +
 * behaviour live in `@pops/overlay-ego`; this file binds toggle state to the
 * shell's `useUIStore` generic overlay map.
 */
const EGO_MODULE_ID = 'ego';

export function ChatFab() {
  const open = useUIStore((state) => state.overlays[EGO_MODULE_ID] ?? false);
  const toggleOverlay = useUIStore((state) => state.toggleOverlay);

  return <EgoFab open={open} onToggle={() => toggleOverlay(EGO_MODULE_ID)} />;
}
