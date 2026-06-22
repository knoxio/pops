import '@testing-library/jest-dom/vitest';

import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

// Local test fixture (a copy of the shell-bundled cerebrum locale) so this lib
// stays self-contained: overlay-ego must build/test in its own repo without
// reaching into a pillar/app's source (extract-to-own-repo litmus, federation §3).
import enAUCerebrum from './__fixtures__/cerebrum-en-AU.json';

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
