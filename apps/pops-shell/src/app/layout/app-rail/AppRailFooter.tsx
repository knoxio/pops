import { matchesAtBoundary } from '@/app/nav/path-utils';
import { PanelLeftClose, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { cn, Tooltip, TooltipContent, TooltipTrigger } from '@pops/ui';

interface AppRailFooterProps {
  pathname: string;
  onToggle: () => void;
}

export function AppRailFooter({ pathname, onToggle }: AppRailFooterProps) {
  const { t } = useTranslation('shell');
  const navigate = useNavigate();
  const settingsActive = matchesAtBoundary(pathname, '/settings');

  return (
    <div className="mt-auto flex flex-col gap-2 items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => navigate('/settings')}
            className="relative w-full flex items-center justify-center py-1 transition-colors group"
            aria-label={t('settings')}
            aria-current={settingsActive ? 'page' : undefined}
          >
            <span
              className={cn(
                'absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full transition-all duration-300',
                settingsActive
                  ? 'h-8 bg-muted-foreground'
                  : 'h-0 bg-transparent group-hover:h-4 group-hover:bg-muted-foreground/40'
              )}
            />
            <span
              className={cn(
                'flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-300',
                settingsActive
                  ? 'bg-muted text-foreground shadow-sm rounded-xl scale-100'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground hover:rounded-xl scale-95 hover:scale-100'
              )}
            >
              <Settings className="h-6 w-6" />
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{t('settings')}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onToggle}
            className="min-w-9 min-h-9 flex items-center justify-center hover:bg-muted rounded-lg"
            aria-label={t('collapseAppRail')}
          >
            <PanelLeftClose className="h-4 w-4 text-muted-foreground" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{t('collapse')}</TooltipContent>
      </Tooltip>
    </div>
  );
}
