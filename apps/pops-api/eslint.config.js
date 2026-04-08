import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules", "dist", "coverage", "*.config.js", "*.config.mjs"],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "max-lines": ["error", { max: 2600, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": [
        "error",
        { max: 600, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      complexity: ["error", 45],
      "max-statements": ["error", 220],
      "max-params": ["error", 12],
      "max-depth": ["error", 7],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-console": "off",
    },
  },
  {
    files: ["src/db/schema.ts", "src/db/seeder.ts"],
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      complexity: "off",
      "max-statements": "off",
      "max-params": "off",
      "max-depth": "off",
    },
  },
  {
    // Relax strict type checking in test files for supertest responses
    files: ["**/*.test.ts", "**/*.spec.ts", "**/test-utils.ts"],
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      complexity: "off",
      "max-statements": "off",
      "max-params": "off",
      "max-depth": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/require-await": "off",
    },
  }
);
