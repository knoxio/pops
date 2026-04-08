import storybook from "eslint-plugin-storybook";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  files: ["src/**/*.{ts,tsx}"],
  plugins: {
    react,
    "react-hooks": reactHooks,
  },
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
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/consistent-type-imports": "warn",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
  },
  settings: {
    react: {
      version: "detect",
    },
  },
}, storybook.configs["flat/recommended"]);
