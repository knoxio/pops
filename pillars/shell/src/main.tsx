import '@pops/ui/theme';
import './i18n';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { fetchBootRegistry } from './app/boot-snapshot';

const root = document.querySelector('#root');
if (!root) throw new Error('Root element not found');

const reactRoot = createRoot(root);

/**
 * Minimal, unbranded splash shown while the boot snapshot resolves (P7-T03).
 * The registry is LAN-local so this is normally sub-100ms; it exists so a slow
 * registry shows a loading state rather than a blank frame, and never blocks
 * rendering for longer than the fetch timeout.
 */
function BootSplash() {
  return (
    <div
      className="flex min-h-screen items-center justify-center text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      Loading…
    </div>
  );
}

reactRoot.render(<BootSplash />);

/**
 * Boot the shell behind an async boundary (P7-T03 / RD-3): resolve the live
 * registry snapshot into the install set BEFORE building the router and
 * mounting the app, so the registry — not the build-time `MODULES` constant —
 * decides which pillars mount.
 *
 * `fetchBootRegistry` never throws: an unreachable / slow / empty registry
 * resolves to the static bundle-map floor (the in-repo app set), so the shell
 * always mounts a usable app surface — it never bricks on a registry outage.
 */
async function bootstrap(): Promise<void> {
  const bootRegistry = await fetchBootRegistry();
  reactRoot.render(
    <StrictMode>
      <App bootRegistry={bootRegistry} />
    </StrictMode>
  );
}

void bootstrap();
