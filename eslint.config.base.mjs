import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

/**
 * Shared ESLint base configuration for the POPS monorepo.
 *
 * Provides:
 * - TypeScript recommended rules
 * - Complexity limits (tightened defaults)
 * - Import sorting via simple-import-sort
 * - no-console enforcement (warn/error allowed)
 * - eslint-config-prettier (last, disables formatting conflicts)
 *
 * Each package imports this and can override/extend as needed.
 */

/** Default complexity limits for most packages. */
const defaultComplexityRules = {
  'max-lines': ['error', { max: 1200, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': [
    'error',
    { max: 600, skipBlankLines: true, skipComments: true, IIFEs: true },
  ],
  complexity: ['error', 45],
  'max-statements': ['error', 160],
  'max-params': ['error', 6],
  'max-depth': ['error', 5],
};

/** Shared TypeScript rules applied to all TS/TSX files. */
const sharedTsRules = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      ignoreRestSiblings: true,
    },
  ],
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', disallowTypeAnnotations: false },
  ],
};

/**
 * Creates the base ESLint flat config array for a package.
 *
 * @param options.ignores - Additional ignore patterns (merged with defaults).
 * @param options.typeChecked - Whether to enable type-aware rules (requires parserOptions.project).
 * @param options.tsconfigRootDir - Root directory for tsconfig resolution (required when typeChecked is true).
 * @param options.react - Whether to include React and React Hooks linting.
 * @returns A flat config array to spread into the package's default export.
 */
export function createBaseConfig({
  ignores = [],
  typeChecked = false,
  tsconfigRootDir,
  react: enableReact = false,
} = {}) {
  const defaultIgnores = [
    'node_modules',
    'dist',
    'coverage',
    '*.config.js',
    '*.config.mjs',
    '*.config.ts',
  ];
  const mergedIgnores = [...new Set([...defaultIgnores, ...ignores])];

  const tsConfigs = typeChecked
    ? tseslint.configs.recommendedTypeChecked
    : tseslint.configs.recommended;

  const configs = [
    { ignores: mergedIgnores },
    js.configs.recommended,
    ...tsConfigs,
    {
      plugins: {
        'simple-import-sort': simpleImportSort,
      },
      rules: {
        ...defaultComplexityRules,
        ...sharedTsRules,
        'no-console': ['error', { allow: ['warn', 'error'] }],
        'simple-import-sort/imports': 'error',
        'simple-import-sort/exports': 'error',
      },
    },
  ];

  if (typeChecked && tsconfigRootDir) {
    configs.push({
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/explicit-function-return-type': [
          'warn',
          {
            allowExpressions: true,
            allowTypedFunctionExpressions: true,
            allowHigherOrderFunctions: true,
          },
        ],
      },
    });
  }

  if (enableReact) {
    configs.push({
      plugins: {
        react,
        'react-hooks': reactHooks,
      },
      rules: {
        'react/jsx-key': 'error',
        'react/no-array-index-key': 'warn',
        'react/no-children-prop': 'error',
        'react/no-danger': 'warn',
        'react/self-closing-comp': 'error',
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'warn',
      },
      settings: {
        react: {
          version: 'detect',
        },
      },
    });
  }

  // Relax rules in story files — console.log is used for action logging
  configs.push({
    files: ['**/*.stories.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  });

  // Prettier must always be last to disable formatting-conflicting rules
  configs.push(eslintConfigPrettier);

  return configs;
}

export { defaultComplexityRules, sharedTsRules };
