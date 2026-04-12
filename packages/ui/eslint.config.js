import jsxA11y from 'eslint-plugin-jsx-a11y';
import storybook from 'eslint-plugin-storybook';

import { createBaseConfig } from '../../eslint.config.base.mjs';

export default [
  ...createBaseConfig({ react: true }),
  {
    plugins: {
      'jsx-a11y': jsxA11y,
    },
    rules: {
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/aria-role': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/interactive-supports-focus': 'warn',
    },
  },
  ...storybook.configs['flat/recommended'],
];
