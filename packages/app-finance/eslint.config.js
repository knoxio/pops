import { createBaseConfig } from '../../eslint.config.base.mjs';

export default [
  ...createBaseConfig({ react: true }),
  {
    // Import wizard components are complex multi-step forms
    files: ['src/components/imports/**/*.{ts,tsx}'],
    rules: {
      'max-lines': ['error', { max: 1600, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 650, skipBlankLines: true, skipComments: true, IIFEs: true }],
      complexity: ['error', 50],
    },
  },
];
