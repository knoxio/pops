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
