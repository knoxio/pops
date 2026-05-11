import { useUIStore } from '@/store/uiStore';
import { lazy, Suspense, useMemo, type ComponentType } from 'react';

import { installedOverlays, type InstalledOverlay } from './registry';

/**
 * Props every overlay component must accept. The shell drives open/close
 * state from `useUIStore` and passes them down so overlays stay agnostic of
 * the persistence mechanism.
 */
export interface OverlayComponentProps {
  open: boolean;
  onClose: () => void;
}

type OverlayComponent = ComponentType<OverlayComponentProps>;

/**
 * Known chrome slots the shell layout exposes (PRD-101 US-07). The shell
 * mounts overlays whose `chromeSlot` matches one of these; unknown slots
 * are skipped at runtime and warned about (the registry build also warns).
 */
export const KNOWN_CHROME_SLOTS = ['assistant', 'notification', 'command'] as const;

export type KnownChromeSlot = (typeof KNOWN_CHROME_SLOTS)[number];

function isKnownSlot(slot: string): slot is KnownChromeSlot {
  return (KNOWN_CHROME_SLOTS as readonly string[]).includes(slot);
}

/**
 * Wrap a manifest's lazy loader in a `ComponentType`-typed `React.lazy`
 * proxy. The loader's resolved default-export is typed as `unknown` in
 * `@pops/types` to keep that package React-agnostic; here we narrow at the
 * single shell boundary that actually mounts components.
 */
function toLazyComponent(overlay: InstalledOverlay): OverlayComponent {
  return lazy(async () => {
    const mod = await overlay.loader();
    return { default: mod.default as OverlayComponent };
  });
}

interface OverlayMountProps {
  overlay: InstalledOverlay;
  Component: OverlayComponent;
}

function OverlayMount({ overlay, Component }: OverlayMountProps) {
  const open = useUIStore((state) => state.overlays[overlay.moduleId] ?? false);
  const setOverlayOpen = useUIStore((state) => state.setOverlayOpen);
  return (
    <Suspense fallback={null}>
      <Component open={open} onClose={() => setOverlayOpen(overlay.moduleId, false)} />
    </Suspense>
  );
}

export interface OverlayHostProps {
  /**
   * The chrome slot this host owns. Only overlays declaring this slot are
   * mounted here. Overlays declaring an unknown slot are dropped (with a
   * one-shot console warning) by `KNOWN_OVERLAY_MOUNTS` below.
   */
  readonly slot: KnownChromeSlot;
}

interface OverlayMountEntry {
  readonly overlay: InstalledOverlay;
  readonly Component: OverlayComponent;
}

/**
 * Build the per-slot mount table once at module load. Each installed
 * overlay is matched against the known-slot set; unknown slots are dropped
 * with a single warning so misconfiguration is observable but never
 * crashes the shell. The table is keyed by slot name so each `OverlayHost`
 * instance can look up just its own bucket without re-filtering.
 */
function buildSlotMounts(): Readonly<Record<KnownChromeSlot, readonly OverlayMountEntry[]>> {
  const buckets: Record<KnownChromeSlot, OverlayMountEntry[]> = {
    assistant: [],
    notification: [],
    command: [],
  };
  for (const overlay of installedOverlays) {
    if (!isKnownSlot(overlay.chromeSlot)) {
      if (typeof console !== 'undefined') {
        console.warn(
          `[OverlayHost] module '${overlay.moduleId}' declares unknown chromeSlot '${overlay.chromeSlot}' — skipping mount`
        );
      }
      continue;
    }
    buckets[overlay.chromeSlot].push({ overlay, Component: toLazyComponent(overlay) });
  }
  return buckets;
}

const SLOT_MOUNTS = buildSlotMounts();

/**
 * Mount every installed overlay whose declared `chromeSlot` matches the
 * `slot` prop. Lazy-loaded via `React.lazy` so absent overlays never
 * appear in the shell bundle. `RootLayout` renders one `OverlayHost` per
 * known slot region so overlays land where their manifest says they
 * belong (PRD-101 US-07).
 */
export function OverlayHost({ slot }: OverlayHostProps) {
  const mounts = useMemo(() => SLOT_MOUNTS[slot], [slot]);

  return (
    <>
      {mounts.map(({ overlay, Component }) => (
        <OverlayMount key={overlay.moduleId} overlay={overlay} Component={Component} />
      ))}
    </>
  );
}
