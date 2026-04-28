import { PanelLeftOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@pops/ui';

interface AppRailCollapsedProps {
  className?: string;
  onToggle: () => void;
}

export function AppRailCollapsed({ className, onToggle }: AppRailCollapsedProps) {
  const { t } = useTranslation('shell');

  return (
    <div
      className={cn(
        'w-0 md:w-10 shrink-0 bg-card border-r border-border',
        'hidden md:flex flex-col items-center pt-2',
        className
      )}
    >
      <button
        onClick={onToggle}
        className="min-w-9 min-h-9 flex items-center justify-center hover:bg-muted rounded-lg"
        aria-label={t('expandAppRail')}
      >
        <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
}
