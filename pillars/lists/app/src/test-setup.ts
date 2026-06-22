import '@testing-library/jest-dom/vitest';

import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enAULists from '@pops/locales/en-AU/lists.json';

// Radix UI components (used by the New-list modal Dialog) rely on
// ResizeObserver to manage popover/portal sizing. jsdom doesn't ship it, so
// without this stub Dialog mounts crash the test.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  lng: 'en-AU',
  fallbackLng: 'en-AU',
  ns: ['lists'],
  defaultNS: 'lists',
  interpolation: { escapeValue: false },
  resources: {
    'en-AU': {
      lists: enAULists,
    },
  },
});
