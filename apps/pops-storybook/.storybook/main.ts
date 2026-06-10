import path from 'path';

import tailwindcss from '@tailwindcss/vite';
import { mergeConfig } from 'vite';

import type { StorybookConfig } from '@storybook/react-vite';

const __dirname = import.meta.dirname;

const config: StorybookConfig = {
  stories: [
    '../../../packages/ui/src/**/*.mdx',
    '../../../packages/ui/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../../../packages/*/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: ['@storybook/addon-a11y', '@chromatic-com/storybook'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  async viteFinal(config) {
    return mergeConfig(config, {
      plugins: [tailwindcss()],
      resolve: {
        alias: [
          {
            find: '@pops/ui/theme/graph-colors',
            replacement: path.resolve(__dirname, '../../../packages/ui/src/theme/graph-colors.ts'),
          },
          {
            find: '@pops/ui/theme',
            replacement: path.resolve(__dirname, '../../../packages/ui/src/theme/globals.css'),
          },
          { find: '@pops/ui', replacement: path.resolve(__dirname, '../../../packages/ui/src') },
          {
            find: '@pops/app-media',
            replacement: path.resolve(__dirname, '../../../packages/app-media/src'),
          },
          {
            find: '@pops/app-finance',
            replacement: path.resolve(__dirname, '../../../packages/app-finance/src'),
          },
          {
            find: '@pops/app-food',
            replacement: path.resolve(__dirname, '../../../packages/app-food/src'),
          },
          {
            find: '@pops/app-inventory',
            replacement: path.resolve(__dirname, '../../../packages/app-inventory/src'),
          },
        ],
      },
    });
  },
};
export default config;
