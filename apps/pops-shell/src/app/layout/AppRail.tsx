import { registeredApps } from '@/app/nav/registry';
import { useUIStore } from '@/store/uiStore';
import { useLocation } from 'react-router';

/**
 * App rail — narrow vertical strip showing registered app icons.
 *
 * Discord-style left-edge indicator for the active app.
 * Single click navigates to the app's basePath.
 * Collapsible via toggle (state persisted in uiStore).
 */
import { cn } from '@pops/ui';

import { AppRailCollapsed } from './app-rail/AppRailCollapsed';
import { AppRailFooter } from './app-rail/AppRailFooter';
import { AppRailIcon } from './app-rail/AppRailIcon';
import { useIsTablet } from './app-rail/useIsTablet';

interface AppRailProps {
  className?: string;
}

export function AppRail({ className }: AppRailProps) {
  const location = useLocation();
  const railOpen = useUIStore((state) => state.railOpen);
  const toggleRail = useUIStore((state) => state.toggleRail);
  const setPageNavOpen = useUIStore((state) => state.setPageNavOpen);
  const setSkipNextPageNavClose = useUIStore((state) => state.setSkipNextPageNavClose);
  const isTablet = useIsTablet();

  if (!railOpen) {
    return <AppRailCollapsed className={className} onToggle={toggleRail} />;
  }

  return (
    <div
      className={cn(
        'w-16 shrink-0 bg-card border-r border-border',
        'hidden md:flex flex-col py-2 gap-2',
        className
      )}
    >
      {registeredApps.map((app) => (
        <AppRailIcon
          key={app.id}
          app={app}
          pathname={location.pathname}
          isTablet={isTablet}
          setPageNavOpen={setPageNavOpen}
          setSkipNextPageNavClose={setSkipNextPageNavClose}
        />
      ))}

      <AppRailFooter pathname={location.pathname} onToggle={toggleRail} />
    </div>
  );
}
