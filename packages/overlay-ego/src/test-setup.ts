import '@testing-library/jest-dom/vitest';

import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enAUCerebrum from '../../../apps/pops-shell/src/i18n/locales/en-AU/cerebrum.json';

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  lng: 'en-AU',
  fallbackLng: 'en-AU',
  ns: ['cerebrum'],
  defaultNS: 'cerebrum',
  interpolation: { escapeValue: false },
  resources: {
    'en-AU': {
      cerebrum: enAUCerebrum,
    },
  },
});
