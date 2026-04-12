import { createBaseConfig } from '../../eslint.config.base.mjs';

export default [
  ...createBaseConfig({ react: true }),
  {
    // Media page components have high complexity due to rich interactive UIs
    files: ['src/pages/**/*.tsx'],
    rules: {
      complexity: ['error', 105],
      'max-lines-per-function': ['error', { max: 650, skipBlankLines: true, skipComments: true, IIFEs: true }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
