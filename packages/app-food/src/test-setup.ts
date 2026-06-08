import '@testing-library/jest-dom/vitest';

import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enAUFood from '../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

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
