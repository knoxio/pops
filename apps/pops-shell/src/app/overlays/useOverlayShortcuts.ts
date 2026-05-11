import { useUIStore } from '@/store/uiStore';
import { useEffect } from 'react';

import { installedOverlays } from './registry';

interface ShortcutSpec {
  readonly key: string;
  readonly needsMod: boolean;
  readonly needsCtrl: boolean;
  readonly needsMeta: boolean;
  readonly needsAlt: boolean;
  readonly needsShift: boolean;
}

function parseShortcut(shortcut: string): ShortcutSpec | null {
  const parts = shortcut
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const key = parts[parts.length - 1];
  if (key === undefined) return null;
  const modifiers = new Set(parts.slice(0, -1));
  return {
    key,
    needsMod: modifiers.has('mod'),
    needsCtrl: modifiers.has('ctrl'),
    needsMeta: modifiers.has('meta'),
    needsAlt: modifiers.has('alt') || modifiers.has('option'),
    needsShift: modifiers.has('shift'),
  };
}

type ModifierFlag = Exclude<keyof ShortcutSpec, 'key'>;
type ModifierCheck = readonly [need: ModifierFlag, present: (e: KeyboardEvent) => boolean];

const MODIFIER_CHECKS: readonly ModifierCheck[] = [
  ['needsMod', (e) => e.metaKey || e.ctrlKey],
  ['needsCtrl', (e) => e.ctrlKey],
  ['needsMeta', (e) => e.metaKey],
  ['needsAlt', (e) => e.altKey],
  ['needsShift', (e) => e.shiftKey],
];

function matchesSpec(spec: ShortcutSpec, e: KeyboardEvent): boolean {
  if (e.key.toLowerCase() !== spec.key) return false;
  return MODIFIER_CHECKS.every(([need, present]) => !spec[need] || present(e));
}

/**
 * Parse a manifest-declared shortcut string (e.g. `mod+i`) into a predicate
 * over `KeyboardEvent`. Supported modifiers: `mod` (Cmd on macOS, Ctrl
 * elsewhere), `ctrl`, `meta`, `alt`/`option`, `shift`. The last segment is
 * the key (case-insensitive). Unknown patterns return a predicate that
 * never matches so misconfigured shortcuts fail closed rather than
 * binding the wrong key.
 */
function compileShortcut(shortcut: string): (e: KeyboardEvent) => boolean {
  const spec = parseShortcut(shortcut);
  if (spec === null) return () => false;
  return (e) => matchesSpec(spec, e);
}

interface ShortcutBinding {
  readonly moduleId: string;
  readonly match: (e: KeyboardEvent) => boolean;
}

function compileBindings(): readonly ShortcutBinding[] {
  const bindings: ShortcutBinding[] = [];
  for (const overlay of installedOverlays) {
    if (overlay.shortcut === undefined) continue;
    bindings.push({ moduleId: overlay.moduleId, match: compileShortcut(overlay.shortcut) });
  }
  return bindings;
}

/**
 * Bind per-overlay keyboard shortcuts declared in module manifests.
 * Centralised in the shell (PRD-101 US-07) so individual overlay packages
 * don't each install their own listener — easier to audit conflicts and
 * easier to disable in non-shell hosts (tests, storybook).
 */
export function useOverlayShortcuts(): void {
  const toggleOverlay = useUIStore((state) => state.toggleOverlay);

  useEffect(() => {
    const bindings = compileBindings();
    if (bindings.length === 0) return;

    function handler(e: KeyboardEvent): void {
      for (const binding of bindings) {
        if (binding.match(e)) {
          e.preventDefault();
          toggleOverlay(binding.moduleId);
          return;
        }
      }
    }

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggleOverlay]);
}
