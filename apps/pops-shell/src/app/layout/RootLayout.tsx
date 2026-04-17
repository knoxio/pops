import { findActiveApp } from '@/app/nav/path-utils';
import { registeredApps } from '@/app/nav/registry';
import { useUIStore } from '@/store/uiStore';
import { useEffect } from 'react';
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

import { AppRail } from './AppRail';
import { PageNav } from './PageNav';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function RootLayout() {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const pageNavOpen = useUIStore((state) => state.pageNavOpen);
  const setPageNavOpen = useUIStore((state) => state.setPageNavOpen);
  const location = useLocation();
  const activeApp = findActiveApp(location.pathname, registeredApps);
  const appColorClass = activeApp?.color ? `app-${activeApp.color}` : undefined;

  // Close tablet overlay on navigation
  useEffect(() => {
    setPageNavOpen(false);
  }, [location.pathname, setPageNavOpen]);

  return (
    <AppContextProvider>
      <div className={cn('min-h-screen bg-background relative', appColorClass)}>
        {/* Ambient background decorative elements */}
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0 opacity-20 dark:opacity-10">
          <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-app-accent/20 blur-[120px]" />
          <div className="absolute bottom-[-5%] left-[-5%] w-[30%] h-[30%] rounded-full bg-app-accent/10 blur-[100px]" />
        </div>

        <div className="relative z-10 pt-14 md:pt-16">
          <TopBar />
          <div className="flex">
            {/* Desktop + Tablet: app rail always visible at md+ */}
            <div className="hidden md:flex h-[calc(100vh-4rem)] sticky top-16 shrink-0">
              <AppRail />
              {/* Desktop only: permanent PageNav (lg+) */}
              <div className="hidden lg:block">
                <PageNav />
              </div>
            </div>

            {/* Tablet overlay: PageNav as overlay (md to lg) */}
            {pageNavOpen && (
              <div className="hidden md:block lg:hidden">
                <div
                  className="fixed inset-0 bg-black/50 z-40"
                  onClick={() => {
                    setPageNavOpen(false);
                  }}
                  aria-hidden="true"
                />
                <aside className="fixed left-16 top-16 bottom-0 z-50 shadow-lg">
                  <PageNav />
                </aside>
              </div>
            )}

            {/* Mobile: overlay sidebar */}
            <Sidebar open={sidebarOpen} />

            <main className="flex-1 min-w-0 overflow-x-hidden p-4 md:p-6 lg:p-8 max-w-screen-2xl mx-auto transition-all duration-200">
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            </main>
          </div>
        </div>
      </div>
    </AppContextProvider>
  );
}
