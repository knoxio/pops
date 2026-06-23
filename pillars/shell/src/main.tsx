import '@pops/ui/theme';
import './i18n';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ErrorBoundary } from '@pops/ui';

import { App } from './app/App';
import { fetchBootRegistry, resolveBootRegistry } from './app/boot-snapshot';

import type { BootRegistry } from './app/boot-snapshot';

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
 * Mount the shell on a resolved install set, wrapped in an `<ErrorBoundary>`
 * so a render-time crash in the app tree degrades to a fallback frame instead
 * of a blank page. This makes the never-brick guarantee STRUCTURAL — it does
 * not depend on `fetchBootRegistry` happening to be total.
 */
function mount(bootRegistry: BootRegistry): void {
  reactRoot.render(
    <StrictMode>
      <ErrorBoundary>
        <App bootRegistry={bootRegistry} />
      </ErrorBoundary>
    </StrictMode>
  );
}

/**
 * Boot the shell behind an async boundary (P7-T03 / RD-3): resolve the live
 * registry snapshot into the install set BEFORE building the router and
 * mounting the app, so the registry — not the build-time `MODULES` constant —
 * decides which pillars mount.
 *
 * `fetchBootRegistry` never throws by contract: an unreachable / slow / empty
 * registry resolves to the static bundle-map floor (the in-repo app set), so
 * the shell always mounts a usable app surface. The `.catch` below is the
 * structural backstop: should resolution ever throw despite that contract
 * (e.g. a future regression), we still mount the static floor rather than
 * leaving the splash up forever — the shell never bricks on a registry outage.
 */
function bootstrap(): Promise<void> {
  return fetchBootRegistry().then(mount);
}

void bootstrap().catch((error: unknown) => {
  console.error('[shell] boot registry resolution failed; mounting static floor', error);
  mount(resolveBootRegistry([]));
});
