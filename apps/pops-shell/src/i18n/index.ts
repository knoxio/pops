/**
 * i18next initialization for the POPS shell.
 *
 * Supported locales: en-AU (default), pt-BR.
 * Namespaces: common, shell, navigation, inventory, cerebrum, finance, food, lists, ai, media, ui.
 *
 * Language preference is persisted to localStorage under the key `pops-locale`.
 */
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enAUAi from '@pops/locales/en-AU/ai.json';
import enAUCerebrum from '@pops/locales/en-AU/cerebrum.json';
import enAUCommon from '@pops/locales/en-AU/common.json';
import enAUFinance from '@pops/locales/en-AU/finance.json';
import enAUFood from '@pops/locales/en-AU/food.json';
import enAUInventory from '@pops/locales/en-AU/inventory.json';
import enAULists from '@pops/locales/en-AU/lists.json';
import enAUMedia from '@pops/locales/en-AU/media.json';
import enAUNavigation from '@pops/locales/en-AU/navigation.json';
import enAUShell from '@pops/locales/en-AU/shell.json';
import enAUUi from '@pops/locales/en-AU/ui.json';
import ptBRAi from '@pops/locales/pt-BR/ai.json';
import ptBRCerebrum from '@pops/locales/pt-BR/cerebrum.json';
import ptBRCommon from '@pops/locales/pt-BR/common.json';
import ptBRFinance from '@pops/locales/pt-BR/finance.json';
import ptBRFood from '@pops/locales/pt-BR/food.json';
import ptBRInventory from '@pops/locales/pt-BR/inventory.json';
import ptBRLists from '@pops/locales/pt-BR/lists.json';
import ptBRMedia from '@pops/locales/pt-BR/media.json';
import ptBRNavigation from '@pops/locales/pt-BR/navigation.json';
import ptBRShell from '@pops/locales/pt-BR/shell.json';
import ptBRUi from '@pops/locales/pt-BR/ui.json';

/** LocalStorage key for persisting the user's locale choice. */
export const LOCALE_STORAGE_KEY = 'pops-locale';

/** Supported locale codes. */
export const SUPPORTED_LOCALES = ['en-AU', 'pt-BR'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Default locale. */
export const DEFAULT_LOCALE: SupportedLocale = 'en-AU';

function getStoredLocale(): SupportedLocale {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
    return stored as SupportedLocale;
  }
  return DEFAULT_LOCALE;
}

const i18n = createInstance();

/**
 * Mirror the active language onto `<html lang>` so screen readers pick up
 * pronunciation rules for the rendered content (WCAG 3.1.1 / 3.1.2).
 */
function syncHtmlLang(lng: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', lng);
  }
}

i18n.on('languageChanged', syncHtmlLang);

void i18n.use(initReactI18next).init({
  lng: getStoredLocale(),
  fallbackLng: DEFAULT_LOCALE,
  ns: [
    'common',
    'shell',
    'navigation',
    'inventory',
    'cerebrum',
    'finance',
    'food',
    'lists',
    'ai',
    'media',
    'ui',
  ],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  resources: {
    'en-AU': {
      common: enAUCommon,
      shell: enAUShell,
      navigation: enAUNavigation,
      inventory: enAUInventory,
      cerebrum: enAUCerebrum,
      finance: enAUFinance,
      food: enAUFood,
      lists: enAULists,
      ai: enAUAi,
      media: enAUMedia,
      ui: enAUUi,
    },
    'pt-BR': {
      common: ptBRCommon,
      shell: ptBRShell,
      navigation: ptBRNavigation,
      inventory: ptBRInventory,
      cerebrum: ptBRCerebrum,
      finance: ptBRFinance,
      food: ptBRFood,
      lists: ptBRLists,
      ai: ptBRAi,
      media: ptBRMedia,
      ui: ptBRUi,
    },
  },
});

// `init` does not fire `languageChanged` for the initial language, so set it
// explicitly here to cover first-paint screen-reader behaviour.
syncHtmlLang(i18n.language || DEFAULT_LOCALE);

export default i18n;
