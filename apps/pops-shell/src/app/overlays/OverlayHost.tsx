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
const KNOWN_CHROME_SLOTS = ['assistant', 'notification', 'command'] as const;

type KnownChromeSlot = (typeof KNOWN_CHROME_SLOTS)[number];

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

/**
 * Mount every installed overlay into the chrome slot declared by its
 * manifest. Lazy-loaded via `React.lazy` so absent overlays never appear
 * in the shell bundle. Renders nothing for unknown slots (and logs a dev
 * warning so the mismatch is visible).
 */
export function OverlayHost() {
  const mounts = useMemo(
    () =>
      installedOverlays
        .filter((o): o is InstalledOverlay => {
          if (isKnownSlot(o.chromeSlot)) return true;
          if (typeof console !== 'undefined') {
            console.warn(
              `[OverlayHost] module '${o.moduleId}' declares unknown chromeSlot '${o.chromeSlot}' — skipping mount`
            );
          }
          return false;
        })
        .map((overlay) => ({ overlay, Component: toLazyComponent(overlay) })),
    []
  );

  return (
    <>
      {mounts.map(({ overlay, Component }) => (
        <OverlayMount key={overlay.moduleId} overlay={overlay} Component={Component} />
      ))}
    </>
  );
}
