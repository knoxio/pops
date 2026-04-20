import { iconMap } from '@/app/nav/icon-map';
import { matchesAtBoundary } from '@/app/nav/path-utils';
import { useNavigate } from 'react-router';

import { cn, Tooltip, TooltipContent, TooltipTrigger } from '@pops/ui';

import type { AppNavConfig } from '@/app/nav/registry';

interface AppRailIconProps {
  app: AppNavConfig;
  pathname: string;
  isTablet: boolean;
  setPageNavOpen: (open: boolean) => void;
  setSkipNextPageNavClose: (skip: boolean) => void;
}

export function AppRailIcon({
  app,
  pathname,
  isTablet,
  setPageNavOpen,
  setSkipNextPageNavClose,
}: AppRailIconProps) {
  const navigate = useNavigate();
  const isActive = matchesAtBoundary(pathname, app.basePath);
  const Icon = iconMap[app.icon];
  const appColorClass = app.color ? `app-${app.color}` : undefined;

  const handleClick = () => {
    if (isTablet) {
      // Set the skip flag before navigate so the location-change effect in
      // RootLayout does not collapse the overlay we are about to open.
      setSkipNextPageNavClose(true);
    }
    void navigate(app.basePath);
    if (isTablet) setPageNavOpen(true);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          className={cn(
            'relative w-full flex items-center justify-center py-1 transition-colors group',
            appColorClass
          )}
          aria-label={app.label}
          aria-current={isActive ? 'page' : undefined}
        >
          <span
            className={cn(
              'absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full transition-all duration-300',
              isActive
                ? 'h-8 bg-app-accent'
                : 'h-0 bg-transparent group-hover:h-4 group-hover:bg-muted-foreground/40'
            )}
          />
          <span
            className={cn(
              'flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-300',
              isActive
                ? 'bg-app-accent text-app-accent-foreground shadow-lg shadow-foreground/20 rounded-xl scale-100'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground hover:rounded-xl scale-95 hover:scale-100'
            )}
          >
            {Icon ? (
              <Icon className="h-6 w-6" />
            ) : (
              <span className="text-lg font-semibold">{app.label[0]}</span>
            )}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{app.label}</TooltipContent>
    </Tooltip>
  );
}
