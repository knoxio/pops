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

import { useBootRegistry } from '../BootRegistryProvider';
import { activeCaptureOverlay, type ActiveCaptureOverlay } from './capture-registry';
import { CaptureModal } from './CaptureModal';
import { useCaptureHotkey } from './useCaptureHotkey';

interface CaptureHotkeyHostProps {
  /** Test-only override; production callers leave this unset. */
  activeOverlayOverride?: ActiveCaptureOverlay | null;
}

export function CaptureHotkeyHost({ activeOverlayOverride }: CaptureHotkeyHostProps = {}) {
  const [open, setOpen] = useState(false);
  // From boot, not the static bundle map POPS-3227 later removed. This host —
  // not the modal — is what production resolves through: it reads the overlay
  // to know which hotkey to bind, then hands the same value down as the
  // modal's override. Resolving it statically left the hotkey bound to
  // nothing for any pillar that had left that map, so the modal's own
  // boot-aware path never even ran (POPS-3266).
  const { manifests, bundleMap } = useBootRegistry();
  const overlay = useMemo<ActiveCaptureOverlay | null>(
    () =>
      activeOverlayOverride !== undefined
        ? activeOverlayOverride
        : activeCaptureOverlay(manifests, bundleMap),
    [activeOverlayOverride, manifests, bundleMap]
  );
  const hotkey = (overlay?.descriptor.hotkey ?? '').trim();

  const onTrigger = useCallback(() => setOpen(true), []);
  useCaptureHotkey({ key: hotkey, enabled: !open && hotkey.length > 0, onTrigger });

  return <CaptureModal open={open} onOpenChange={setOpen} activeOverlayOverride={overlay} />;
}
