/**
 * i18next initialization for the POPS shell.
 *
 * Supported locales: en-AU (default), pt-BR.
 * Namespaces: common (shared strings), shell (shell UI), navigation (nav labels).
 *
 * Language preference is persisted to localStorage under the key `pops-locale`.
 */
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enAUCommon from './locales/en-AU/common.json';
import enAUNavigation from './locales/en-AU/navigation.json';
import enAUShell from './locales/en-AU/shell.json';
import ptBRCommon from './locales/pt-BR/common.json';
import ptBRNavigation from './locales/pt-BR/navigation.json';
import ptBRShell from './locales/pt-BR/shell.json';

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
  ns: ['common', 'shell', 'navigation'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  resources: {
    'en-AU': {
      common: enAUCommon,
      shell: enAUShell,
      navigation: enAUNavigation,
    },
    'pt-BR': {
      common: ptBRCommon,
      shell: ptBRShell,
      navigation: ptBRNavigation,
    },
  },
});

export default i18n;
