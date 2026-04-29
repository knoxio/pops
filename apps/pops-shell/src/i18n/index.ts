/**
 * i18next initialization for the POPS shell.
 *
 * Supported locales: en-AU (default), pt-BR.
 * Namespaces: common, shell, navigation, errors, inventory, cerebrum, finance, ai, media, ui.
 *
 * Language preference is persisted to localStorage under the key `pops-locale`.
 */
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enAUAi from './locales/en-AU/ai.json';
import enAUCerebrum from './locales/en-AU/cerebrum.json';
import enAUCommon from './locales/en-AU/common.json';
import enAUFinance from './locales/en-AU/finance.json';
import enAUInventory from './locales/en-AU/inventory.json';
import enAUMedia from './locales/en-AU/media.json';
import enAUNavigation from './locales/en-AU/navigation.json';
import enAUShell from './locales/en-AU/shell.json';
import enAUUi from './locales/en-AU/ui.json';
import ptBRAi from './locales/pt-BR/ai.json';
import ptBRCerebrum from './locales/pt-BR/cerebrum.json';
import ptBRCommon from './locales/pt-BR/common.json';
import ptBRFinance from './locales/pt-BR/finance.json';
import ptBRInventory from './locales/pt-BR/inventory.json';
import ptBRMedia from './locales/pt-BR/media.json';
import ptBRNavigation from './locales/pt-BR/navigation.json';
import ptBRShell from './locales/pt-BR/shell.json';
import ptBRUi from './locales/pt-BR/ui.json';

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

void i18n.use(initReactI18next).init({
  lng: getStoredLocale(),
  fallbackLng: DEFAULT_LOCALE,
  ns: ['common', 'shell', 'navigation', 'inventory', 'cerebrum', 'finance', 'ai', 'media', 'ui'],
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
      ai: ptBRAi,
      media: ptBRMedia,
      ui: ptBRUi,
    },
  },
});

export default i18n;
