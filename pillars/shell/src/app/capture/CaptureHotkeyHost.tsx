/**
 * CaptureHotkeyHost — owns the global capture hotkey binding.
 *
 * Reads the active capture overlay's `hotkey` descriptor from the
 * registry walk and binds it via `useCaptureHotkey`. Pillars that want
 * a different hotkey publish a different `captureOverlay.hotkey` value
 * on their manifest.
 *
 * When no manifest contributes a `captureOverlay`, the host renders the
 * modal anyway — the modal handles the empty surface — but does not bind
 * any hotkey.
 */
import { useCallback, useMemo, useState } from 'react';

import { activeCaptureOverlay, type ActiveCaptureOverlay } from './capture-registry';
import { CaptureModal } from './CaptureModal';
import { useCaptureHotkey } from './useCaptureHotkey';

interface CaptureHotkeyHostProps {
  /** Test-only override; production callers leave this unset. */
  activeOverlayOverride?: ActiveCaptureOverlay | null;
}

export function CaptureHotkeyHost({ activeOverlayOverride }: CaptureHotkeyHostProps = {}) {
  const [open, setOpen] = useState(false);
  const overlay = useMemo<ActiveCaptureOverlay | null>(
    () => (activeOverlayOverride !== undefined ? activeOverlayOverride : activeCaptureOverlay()),
    [activeOverlayOverride]
  );
  const hotkey = (overlay?.descriptor.hotkey ?? '').trim();

  const onTrigger = useCallback(() => setOpen(true), []);
  useCaptureHotkey({ key: hotkey, enabled: !open && hotkey.length > 0, onTrigger });

  return <CaptureModal open={open} onOpenChange={setOpen} activeOverlayOverride={overlay} />;
}
