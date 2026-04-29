import '@testing-library/jest-dom/vitest';

import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enAUMedia from '../../../apps/pops-shell/src/i18n/locales/en-AU/media.json';

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  lng: 'en-AU',
  fallbackLng: 'en-AU',
  ns: ['media'],
  defaultNS: 'media',
  interpolation: { escapeValue: false },
  resources: {
    'en-AU': {
      media: enAUMedia,
    },
  },
});

// jsdom does not implement ResizeObserver, but Radix UI's react-use-size hook
// requires it. Provide a no-op stub so Tooltip/Popover components don't crash.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverStub;
