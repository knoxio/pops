import { createBaseConfig } from '../../eslint.config.base.mjs';

export default [
  ...createBaseConfig({ typeChecked: true, tsconfigRootDir: import.meta.dirname }),
  {
    rules: {
      // pops-api has larger files than frontend packages — override base limits
      'max-lines': ['error', { max: 2000, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: 450, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      // existing update functions (inventory/items, media/movies) have complexity ~41
      complexity: ['error', 42],
      'max-params': ['error', 10],

      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
    },
  },
  {
    files: ['src/db/schema.ts', 'src/db/seeder.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      complexity: 'off',
      'max-statements': 'off',
      'max-params': 'off',
      'max-depth': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/test-utils.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      complexity: 'off',
      'max-statements': 'off',
      'max-params': 'off',
      'max-depth': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
];
