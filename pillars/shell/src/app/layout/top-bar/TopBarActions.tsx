import { useThemeStore } from '@/store/themeStore';
import { Moon, Search, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { LocaleSwitcher } from './LocaleSwitcher';
import { NudgeIndicator } from './NudgeIndicator';

interface TopBarActionsProps {
  onOpenMobileSearch: () => void;
}

export function TopBarActions({ onOpenMobileSearch }: TopBarActionsProps) {
  const { t } = useTranslation('shell');
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  return (
    <div className="ml-auto flex items-center gap-1 md:gap-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenMobileSearch}
        className="min-w-[44px] min-h-[44px] md:hidden"
        aria-label={t('openSearch')}
        data-testid="mobile-search-btn"
      >
        <Search className="h-5 w-5" />
      </Button>

      <NudgeIndicator />

      <LocaleSwitcher />

      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="min-w-[44px] min-h-[44px] transition-colors group"
        aria-label={t('toggleTheme')}
      >
        {theme === 'dark' ? (
          <Sun className="h-5 w-5 text-amber-400 group-hover:text-amber-300 transition-colors" />
        ) : (
          <Moon className="h-5 w-5 text-indigo-600 group-hover:text-indigo-500 transition-colors" />
        )}
      </Button>
    </div>
  );
}
