/**
 * Mobile sidebar navigation
 *
 * Overlay sidebar for mobile (<768px) with backdrop.
 * Desktop navigation is handled by AppRail + PageNav.
 */
import { Button } from '@pops/ui';
import { X } from 'lucide-react';
import { Link, useLocation } from 'react-router';

import { iconMap } from '@/app/nav/icon-map';
import { isPageActive } from '@/app/nav/path-utils';
import { registeredApps } from '@/app/nav/registry';
import { useUIStore } from '@/store/uiStore';

import { BuildVersion } from './BuildVersion';

interface SidebarProps {
  open: boolean;
}

export function Sidebar({ open }: SidebarProps) {
  const location = useLocation();
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);

  if (!open) return null;

  const handleNavClick = () => {
    setSidebarOpen(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 md:hidden"
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside className="w-64 bg-card border-r border-border fixed z-50 top-0 left-0 h-full md:hidden">
        {/* Header with close button */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold">POPS</span>
            <BuildVersion />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
            className="min-w-[44px] min-h-[44px]"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="p-4 space-y-1">
          {registeredApps.map((app) =>
            app.items.map((item) => {
              const fullPath = `${app.basePath}${item.path}`;
              const isActive = isPageActive(location.pathname, app.basePath, item.path);
              const Icon = iconMap[item.icon];

              return (
                <Link
                  key={fullPath}
                  to={fullPath}
                  onClick={handleNavClick}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-medium min-h-[44px] ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {Icon && <Icon className="h-5 w-5 shrink-0" />}
                  <span>{item.label}</span>
                </Link>
              );
            })
          )}
        </nav>
      </aside>
    </>
  );
}
