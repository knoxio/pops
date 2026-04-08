import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '*.csv', '*.json', '*.jsonl'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'max-lines': ['error', { max: 1600, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: 900, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      complexity: ['error', 60],
      'max-statements': ['error', 220],
      'max-params': ['error', 7],
      'max-depth': ['error', 7],
      ...tseslint.configs['recommended'].rules,
      ...tseslint.configs['recommended-type-checked'].rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      'no-console': 'off',
    },
  },
  prettierConfig,
];
