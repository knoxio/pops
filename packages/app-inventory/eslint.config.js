import { createBaseConfig } from '../../eslint.config.base.mjs';

export default [
  ...createBaseConfig({ react: true }),
  {
    // ItemFormPage is a large multi-section form — needs a higher function line limit
    files: ['src/pages/ItemFormPage.tsx'],
    rules: {
      'max-lines-per-function': ['error', { max: 750, skipBlankLines: true, skipComments: true, IIFEs: true }],
    },
  },
];
