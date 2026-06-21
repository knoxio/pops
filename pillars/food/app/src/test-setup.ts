import '@testing-library/jest-dom/vitest';

import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enAUFood from '../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

// jsdom doesn't ship a ResizeObserver; Radix Dialog / Tooltip primitives
// rely on it. Only install the stub when the environment doesn't already
// provide one so a future jsdom update can swap in a real implementation.
if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    class ResizeObserverPolyfill {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
}

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  lng: 'en-AU',
  fallbackLng: 'en-AU',
  ns: ['food'],
  defaultNS: 'food',
  interpolation: { escapeValue: false },
  resources: {
    'en-AU': {
      food: enAUFood,
    },
  },
});
