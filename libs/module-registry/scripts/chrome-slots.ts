/**
 * Conventional shell chrome slot names recognised by the shell layout
 * (PRD-101 US-07). Modules are free to declare any string here — the
 * shell logs a warning and skips mount when a slot is not recognised —
 * but the registry build also warns at build time so the mismatch is
 * visible in CI logs without waiting for a runtime mount attempt.
 */
import type { ModuleManifest } from '@pops/types';

export const KNOWN_CHROME_SLOTS: readonly string[] = ['assistant', 'notification', 'command'];

export function warnUnknownChromeSlots(
  manifests: readonly ModuleManifest[],
  warn: (message: string) => void
): void {
  for (const m of manifests) {
    const slot = m.frontend?.overlay?.chromeSlot;
    if (slot === undefined) continue;
    if (KNOWN_CHROME_SLOTS.includes(slot)) continue;
    warn(
      `module '${m.id}' declares overlay chromeSlot '${slot}' which is not a known shell slot (known: ${KNOWN_CHROME_SLOTS.join(', ')})`
    );
  }
}
