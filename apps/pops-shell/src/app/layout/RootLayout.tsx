import { findActiveApp } from '@/app/nav/path-utils';
import { registeredApps } from '@/app/nav/registry';
import { installedOverlays } from '@/app/overlays/registry';
import { useUIStore } from '@/store/uiStore';
import { Outlet, useLocation } from 'react-router';

/**
 * Root layout — top bar + two-level navigation + content area
 *
 * Desktop (≥1024px): AppRail (icons) + PageNav (page links) push content
 * Tablet (768–1023px): AppRail visible, PageNav as overlay on app icon click
 * Mobile (<768px): Hamburger opens Sidebar overlay with all pages
 *
 * Overlays (PRD-101 US-07) are mounted from the module registry via
 * `OverlayHost` — `RootLayout` itself does not import overlay components.
 */
import { AppContextProvider } from '@pops/navigation';
import { cn, ErrorBoundary } from '@pops/ui';

import { OverlayHost } from '../overlays/OverlayHost';
import { useOverlayShortcuts } from '../overlays/useOverlayShortcuts';
import { ChatFab } from './ChatFab';
import { AmbientBackground } from './root-layout/AmbientBackground';
import { NavRegion } from './root-layout/NavRegion';
import { usePageNavAutoClose } from './root-layout/usePageNavAutoClose';
import { Sidebar } from './Sidebar';
import { SkipLink } from './SkipLink';
import { TopBar } from './TopBar';

const EGO_OVERLAY_INSTALLED = installedOverlays.some((o) => o.moduleId === 'ego');

export function RootLayout() {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const pageNavOpen = useUIStore((state) => state.pageNavOpen);
  const setPageNavOpen = useUIStore((state) => state.setPageNavOpen);
  const location = useLocation();
  const activeApp = findActiveApp(location.pathname, registeredApps);
  const appColorClass = activeApp?.color ? `app-${activeApp.color}` : undefined;

  usePageNavAutoClose(location.pathname, setPageNavOpen);
  useOverlayShortcuts();

  return (
    <AppContextProvider>
      <div className={cn('min-h-screen bg-background relative', appColorClass)}>
        <SkipLink />
        <AmbientBackground />

        <div className="relative z-10 pt-14 md:pt-16">
          <TopBar />
          <div className="flex">
            <NavRegion pageNavOpen={pageNavOpen} onClosePageNav={() => setPageNavOpen(false)} />

            {/* Mobile: overlay sidebar */}
            <Sidebar open={sidebarOpen} />

            <main
              id="main-content"
              tabIndex={-1}
              className="flex-1 min-w-0 overflow-x-clip p-4 md:p-6 lg:p-8 max-w-screen-2xl mx-auto transition-all duration-200 focus:outline-none"
            >
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            </main>
          </div>
        </div>

        {EGO_OVERLAY_INSTALLED && <ChatFab />}

        {/*
         * One host per known chrome slot (PRD-101 US-07). Each host mounts
         * only the overlays whose manifest declares that slot, so slot
         * declarations actually drive placement rather than being purely
         * informational. Positioning is intentionally bare — overlays own
         * their own visual chrome (fixed positioning, z-index, etc.); the
         * host wrappers are anchors so future slot-specific layout (e.g.
         * a notification stack region) can replace these without touching
         * overlay packages.
         */}
        <div data-overlay-slot="assistant">
          <OverlayHost slot="assistant" />
        </div>
        <div data-overlay-slot="notification">
          <OverlayHost slot="notification" />
        </div>
        <div data-overlay-slot="command">
          <OverlayHost slot="command" />
        </div>
      </div>
    </AppContextProvider>
  );
}
