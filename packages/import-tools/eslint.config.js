import globals from 'globals';

import { createBaseConfig } from '../../eslint.config.base.mjs';

export default [
  ...createBaseConfig({ typeChecked: true, tsconfigRootDir: import.meta.dirname }),
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // CLI scripts legitimately use console.log for user-facing output
      'no-console': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    },
  },
];
