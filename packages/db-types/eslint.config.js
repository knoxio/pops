import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules", "dist", "coverage", "*.config.js", "*.config.mjs"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "max-lines": ["error", { max: 1600, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": [
        "error",
        { max: 900, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      complexity: ["error", 60],
      "max-statements": ["error", 220],
      "max-params": ["error", 7],
      "max-depth": ["error", 7],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  }
);
