import { registeredApps } from '@/app/nav/registry';
import { useUIStore } from '@/store/uiStore';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

/**
 * Mobile sidebar navigation
 *
 * Overlay sidebar for mobile (<768px) with backdrop.
 * Desktop navigation is handled by AppRail + PageNav.
 */
import { Button } from '@pops/ui';

import { BuildVersion } from './BuildVersion';
import { SidebarNavLink } from './sidebar/SidebarNavLink';

interface SidebarProps {
  open: boolean;
}

export function Sidebar({ open }: SidebarProps) {
  const { t } = useTranslation('shell');
  const location = useLocation();
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const close = () => setSidebarOpen(false);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 md:hidden"
        onClick={close}
        aria-hidden="true"
      />

      <aside className="w-64 bg-card border-r border-border fixed z-50 top-0 left-0 h-full md:hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold">POPS</span>
            <BuildVersion />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={close}
            className="min-w-[44px] min-h-[44px]"
            aria-label={t('closeSidebar')}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="p-4 space-y-1">
          {registeredApps.flatMap((app) =>
            app.items.map((item) => (
              <SidebarNavLink
                key={`${app.basePath}${item.path}`}
                app={app}
                item={item}
                pathname={location.pathname}
                onNavigate={close}
              />
            ))
          )}
        </nav>
      </aside>
    </>
  );
}
