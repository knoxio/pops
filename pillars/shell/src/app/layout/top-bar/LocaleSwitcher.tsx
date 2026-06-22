/**
 * Locale switcher dropdown.
 *
 * Renders a button that toggles between supported locales.
 * Persists the selection to localStorage and updates i18next.
 */
import { LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } from '@/i18n';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from '@pops/ui';

import type { SupportedLocale } from '@/i18n';

const LOCALE_LABEL_KEYS: Record<SupportedLocale, string> = {
  'en-AU': 'localeEnAU',
  'pt-BR': 'localePtBR',
};

export function LocaleSwitcher() {
  const { t, i18n } = useTranslation('shell');

  const changeLocale = (locale: SupportedLocale) => {
    void i18n.changeLanguage(locale);
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  };

  return (
    <DropdownMenuRoot>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="min-w-[44px] min-h-[44px] transition-colors group"
          aria-label={t('locale')}
        >
          <Languages className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LOCALES.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => changeLocale(locale)}
            className={i18n.language === locale ? 'bg-accent' : undefined}
          >
            {t(LOCALE_LABEL_KEYS[locale])}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenuRoot>
  );
}
