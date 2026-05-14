/**
 * useCaptureHotkey — single-key shortcut that opens the global capture modal
 * (PRD-081 US-09).
 *
 * Registers a keydown listener on `window` and fires the callback when the
 * configured key is pressed. The suppression logic lives in
 * `capture-hotkey-helpers.ts` so it can be exercised in unit tests without
 * rendering the hook.
 */
import { useEffect } from 'react';

import { shouldSuppress } from './capture-hotkey-helpers';

interface UseCaptureHotkeyArgs {
  /** Hotkey letter from settings. Empty string disables the listener. */
  key: string;
  /** Whether the modal is already open — suppresses re-fires. */
  enabled: boolean;
  /** Open-modal callback. */
  onTrigger: () => void;
}

export function useCaptureHotkey({ key, enabled, onTrigger }: UseCaptureHotkeyArgs): void {
  useEffect(() => {
    const trimmed = key.trim();
    if (trimmed.length === 0 || !enabled) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== trimmed) return;
      if (shouldSuppress(e)) return;
      e.preventDefault();
      onTrigger();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, enabled, onTrigger]);
}
