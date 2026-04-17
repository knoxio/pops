import storybook from "eslint-plugin-storybook";

import { createBaseConfig } from "../../eslint.config.base.mjs";

export default [
  ...createBaseConfig({ react: true }),
  ...storybook.configs["flat/recommended"],
];
