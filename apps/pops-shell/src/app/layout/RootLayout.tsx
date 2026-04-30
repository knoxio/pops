import { findActiveApp } from '@/app/nav/path-utils';
import { registeredApps } from '@/app/nav/registry';
import { useUIStore } from '@/store/uiStore';
import { Outlet, useLocation } from 'react-router';

/**
 * Root layout — top bar + two-level navigation + content area
 *
 * Desktop (≥1024px): AppRail (icons) + PageNav (page links) push content
 * Tablet (768–1023px): AppRail visible, PageNav as overlay on app icon click
 * Mobile (<768px): Hamburger opens Sidebar overlay with all pages
 */
import { AppContextProvider } from '@pops/navigation';
import { cn, ErrorBoundary } from '@pops/ui';

import { ChatFab } from './ChatFab';
import { ChatOverlay } from './ChatOverlay';
import { AmbientBackground } from './root-layout/AmbientBackground';
import { NavRegion } from './root-layout/NavRegion';
import { usePageNavAutoClose } from './root-layout/usePageNavAutoClose';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function RootLayout() {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const pageNavOpen = useUIStore((state) => state.pageNavOpen);
  const setPageNavOpen = useUIStore((state) => state.setPageNavOpen);
  const location = useLocation();
  const activeApp = findActiveApp(location.pathname, registeredApps);
  const appColorClass = activeApp?.color ? `app-${activeApp.color}` : undefined;

  usePageNavAutoClose(location.pathname, setPageNavOpen);

  return (
    <AppContextProvider>
      <div className={cn('min-h-screen bg-background relative', appColorClass)}>
        <AmbientBackground />

        <div className="relative z-10 pt-14 md:pt-16">
          <TopBar />
          <div className="flex">
            <NavRegion pageNavOpen={pageNavOpen} onClosePageNav={() => setPageNavOpen(false)} />

            {/* Mobile: overlay sidebar */}
            <Sidebar open={sidebarOpen} />

            <main className="flex-1 min-w-0 overflow-x-clip p-4 md:p-6 lg:p-8 max-w-screen-2xl mx-auto transition-all duration-200">
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            </main>
          </div>
        </div>

        <ChatFab />
        <ChatOverlay />
      </div>
    </AppContextProvider>
  );
}
