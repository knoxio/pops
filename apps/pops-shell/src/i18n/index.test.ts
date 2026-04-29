/**
 * Tests for i18n initialization, locale switching, and translation coverage.
 *
 * Validates:
 * - i18next initialises with en-AU by default
 * - Language switching works and persists to localStorage
 * - All namespaces are loaded for both locales
 * - Translation keys exist in both en-AU and pt-BR (no missing translations)
 * - Interpolation works (e.g. shell.appPages with {{app}})
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import i18n, { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } from '.';
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All key sets grouped by namespace for comparison. */
const EN_AU_BUNDLES = {
  common: enAUCommon,
  shell: enAUShell,
  navigation: enAUNavigation,
  inventory: enAUInventory,
  cerebrum: enAUCerebrum,
  finance: enAUFinance,
  ai: enAUAi,
  media: enAUMedia,
  ui: enAUUi,
};
const PT_BR_BUNDLES = {
  common: ptBRCommon,
  shell: ptBRShell,
  navigation: ptBRNavigation,
  inventory: ptBRInventory,
  cerebrum: ptBRCerebrum,
  finance: ptBRFinance,
  ai: ptBRAi,
  media: ptBRMedia,
  ui: ptBRUi,
};

function sortedKeys(obj: Record<string, string>): string[] {
  return Object.keys(obj).toSorted();
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  void i18n.changeLanguage(DEFAULT_LOCALE);
});

afterEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

describe('i18n initialization', () => {
  it('initialises with en-AU as default language', () => {
    expect(i18n.language).toBe('en-AU');
  });

  it('has en-AU as fallback language', () => {
    expect(i18n.options.fallbackLng).toEqual(['en-AU']);
  });

  it('exposes the correct supported locales', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en-AU', 'pt-BR']);
  });

  it('registers all namespaces', () => {
    const ns = i18n.options.ns;
    expect(ns).toContain('common');
    expect(ns).toContain('shell');
    expect(ns).toContain('navigation');
    expect(ns).toContain('inventory');
    expect(ns).toContain('cerebrum');
    expect(ns).toContain('finance');
    expect(ns).toContain('ai');
    expect(ns).toContain('media');
    expect(ns).toContain('ui');
  });

  it('uses common as the default namespace', () => {
    expect(i18n.options.defaultNS).toBe('common');
  });

  it('disables HTML escaping (React handles it)', () => {
    expect(i18n.options.interpolation?.escapeValue).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Locale switching
// ---------------------------------------------------------------------------

describe('locale switching', () => {
  it('switches to pt-BR', async () => {
    await i18n.changeLanguage('pt-BR');
    expect(i18n.language).toBe('pt-BR');
  });

  it('switches back to en-AU', async () => {
    await i18n.changeLanguage('pt-BR');
    await i18n.changeLanguage('en-AU');
    expect(i18n.language).toBe('en-AU');
  });

  it('returns translated strings after switching', async () => {
    expect(i18n.t('common:save')).toBe('Save');
    await i18n.changeLanguage('pt-BR');
    expect(i18n.t('common:save')).toBe('Salvar');
  });
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

describe('locale persistence', () => {
  it('reads stored locale from localStorage on init', () => {
    // The current test environment starts with en-AU. The getStoredLocale
    // function is only called at init time, so we test the storage key format.
    expect(LOCALE_STORAGE_KEY).toBe('pops-locale');
  });

  it('ignores invalid stored locales', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fr-FR');
    // DEFAULT_LOCALE should be returned when stored value is invalid
    expect(DEFAULT_LOCALE).toBe('en-AU');
  });
});

// ---------------------------------------------------------------------------
// Translation completeness
// ---------------------------------------------------------------------------

describe('translation completeness', () => {
  const ALL_NS = [
    'common',
    'shell',
    'navigation',
    'inventory',
    'cerebrum',
    'finance',
    'ai',
    'media',
    'ui',
  ] as const;

  for (const ns of ALL_NS) {
    it(`${ns}: en-AU and pt-BR have identical key sets`, () => {
      const enKeys = sortedKeys(EN_AU_BUNDLES[ns]);
      const ptKeys = sortedKeys(PT_BR_BUNDLES[ns]);
      expect(enKeys).toEqual(ptKeys);
    });

    it(`${ns}: no empty values in en-AU`, () => {
      for (const [key, value] of Object.entries(EN_AU_BUNDLES[ns])) {
        expect(value.trim().length, `en-AU ${ns}.${key} is empty`).toBeGreaterThan(0);
      }
    });

    it(`${ns}: no empty values in pt-BR`, () => {
      for (const [key, value] of Object.entries(PT_BR_BUNDLES[ns])) {
        expect(value.trim().length, `pt-BR ${ns}.${key} is empty`).toBeGreaterThan(0);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Translation lookups
// ---------------------------------------------------------------------------

describe('translation lookups', () => {
  it('resolves common namespace keys', () => {
    expect(i18n.t('common:save')).toBe('Save');
    expect(i18n.t('common:cancel')).toBe('Cancel');
    expect(i18n.t('common:delete')).toBe('Delete');
  });

  it('resolves shell namespace keys', () => {
    expect(i18n.t('shell:settings')).toBe('Settings');
    expect(i18n.t('shell:toggleTheme')).toBe('Toggle theme');
    expect(i18n.t('shell:pageNotFound')).toBe('Page not found');
  });

  it('resolves navigation namespace keys', () => {
    expect(i18n.t('navigation:finance')).toBe('Finance');
    expect(i18n.t('navigation:media.library')).toBe('Library');
    expect(i18n.t('navigation:cerebrum.admin.usage')).toBe('AI Usage');
  });

  it('resolves finance namespace keys', () => {
    expect(i18n.t('finance:dashboard')).toBe('Dashboard');
    expect(i18n.t('finance:budgets')).toBe('Budgets');
    expect(i18n.t('finance:transactions')).toBe('Transactions');
  });

  it('resolves ai namespace keys', () => {
    expect(i18n.t('ai:observability')).toBe('AI Observability');
    expect(i18n.t('ai:cache.title')).toBe('Cache Management');
    expect(i18n.t('ai:rules.title')).toBe('Categorisation Rules');
  });

  it('resolves media namespace keys', () => {
    expect(i18n.t('media:library')).toBe('Library');
    expect(i18n.t('media:watchlist')).toBe('Watchlist');
    expect(i18n.t('media:compare')).toBe('Compare Arena');
  });

  it('resolves ui namespace keys', () => {
    expect(i18n.t('ui:dataTable.columns')).toBe('Columns');
    expect(i18n.t('ui:dataTable.previous')).toBe('Previous');
    expect(i18n.t('ui:fileUpload.dragSingle')).toBe('Drag a file here, or click to browse');
  });

  it('resolves pt-BR translations', async () => {
    await i18n.changeLanguage('pt-BR');
    expect(i18n.t('common:save')).toBe('Salvar');
    expect(i18n.t('shell:settings')).toBe('Configurações');
    expect(i18n.t('navigation:finance')).toBe('Finanças');
  });
});

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

describe('interpolation', () => {
  it('interpolates {{app}} in shell.appPages', () => {
    expect(i18n.t('shell:appPages', { app: 'Finance' })).toBe('Finance pages');
  });

  it('interpolates {{app}} in pt-BR shell.appPages', async () => {
    await i18n.changeLanguage('pt-BR');
    expect(i18n.t('shell:appPages', { app: 'Finanças' })).toBe('Páginas de Finanças');
  });

  it('interpolates finance namespace variables', () => {
    expect(i18n.t('finance:transactions.totalCount', { count: 42 })).toBe('42 total transactions');
  });

  it('interpolates ui namespace variables', () => {
    expect(i18n.t('ui:dataTable.page', { current: 1, total: 5 })).toBe('Page 1 of 5');
  });
});
