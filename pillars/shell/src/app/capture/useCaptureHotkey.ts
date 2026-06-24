/**
 * useCaptureHotkey — keyboard shortcut that opens the global capture
 * modal.
 *
 * Accepts both single-key shortcuts (`'c'`) and the wire-format chord
 * shape declared on `frontend.captureOverlay.hotkey` (e.g.
 * `'cmd+shift+k'`). When a chord with modifiers is supplied the modifier
 * suppression in `capture-hotkey-helpers.ts` is bypassed for the chord
 * itself — focus-inside-input suppression still applies for both shapes.
 *
 * Registered on `window` keydown. Empty string disables the listener.
 */
import { useEffect } from 'react';

import { shouldSuppress } from './capture-hotkey-helpers';

interface UseCaptureHotkeyArgs {
  /** Hotkey wire string (single key or `mod+mod+key` chord). Empty disables. */
  key: string;
  /** Whether the modal is already open — suppresses re-fires. */
  enabled: boolean;
  /** Open-modal callback. */
  onTrigger: () => void;
}

interface ParsedHotkey {
  readonly key: string;
  readonly meta: boolean;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
}

type ModifierKind = 'meta' | 'ctrl' | 'shift' | 'alt';

const MODIFIER_ALIASES: Readonly<Record<string, ModifierKind>> = {
  cmd: 'meta',
  meta: 'meta',
  mod: 'meta',
  super: 'meta',
  ctrl: 'ctrl',
  control: 'ctrl',
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
};

function splitHotkey(raw: string): readonly string[] {
  return raw
    .trim()
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Parse a wire-format hotkey string into the modifier flags + key. The
 * `cmd` / `mod` aliases map to `meta` (Apple) and the `key` segment is
 * matched against `KeyboardEvent.key`. Multi-char chord segments are
 * lower-cased so `'Cmd+Shift+K'` and `'cmd+shift+k'` are equivalent.
 *
 * Returns `null` for empty input. The single-character form (`'c'`)
 * yields `{ key: 'c', meta: false, ctrl: false, shift: false, alt: false }`.
 */
export function parseHotkey(raw: string): ParsedHotkey | null {
  const parts = splitHotkey(raw);
  if (parts.length === 0) return null;
  const flags: Record<ModifierKind, boolean> = {
    meta: false,
    ctrl: false,
    shift: false,
    alt: false,
  };
  let keyPart: string | null = null;
  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part];
    if (modifier !== undefined) {
      flags[modifier] = true;
      continue;
    }
    keyPart = part;
  }
  if (keyPart === null) return null;
  return { key: keyPart, ...flags };
}

function matchesEvent(parsed: ParsedHotkey, e: KeyboardEvent): boolean {
  if (e.key.toLowerCase() !== parsed.key) return false;
  if (e.metaKey !== parsed.meta) return false;
  if (e.ctrlKey !== parsed.ctrl) return false;
  if (e.shiftKey !== parsed.shift) return false;
  if (e.altKey !== parsed.alt) return false;
  return true;
}

function hasModifier(p: ParsedHotkey): boolean {
  return p.meta || p.ctrl || p.alt;
}

export function useCaptureHotkey({ key, enabled, onTrigger }: UseCaptureHotkeyArgs): void {
  useEffect(() => {
    const parsed = parseHotkey(key);
    if (parsed === null || !enabled) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (!matchesEvent(parsed, e)) return;
      if (e.defaultPrevented) return;
      if (e.isComposing) return;
      // Chords with a non-shift modifier fire even when focus is inside
      // an editable surface — that is the whole point of `cmd+shift+k`.
      // Plain single-key shortcuts keep the input-focus suppression.
      if (!hasModifier(parsed) && shouldSuppress(e)) return;
      e.preventDefault();
      onTrigger();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, enabled, onTrigger]);
}
