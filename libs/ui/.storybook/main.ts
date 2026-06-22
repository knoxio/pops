import path from 'path';

import tailwindcss from '@tailwindcss/vite';
import { mergeConfig } from 'vite';

import type { StorybookConfig } from '@storybook/react-vite';

const __dirname = import.meta.dirname;

const config: StorybookConfig = {
  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../../*/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../../../pillars/*/*/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
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
            replacement: path.resolve(__dirname, '../src/theme/graph-colors.ts'),
          },
          {
            find: '@pops/ui/theme',
            replacement: path.resolve(__dirname, '../src/theme/globals.css'),
          },
          { find: '@pops/ui', replacement: path.resolve(__dirname, '../src') },
          {
            find: '@pops/app-ai',
            replacement: path.resolve(__dirname, '../../../pillars/registry/app/src'),
          },
          {
            find: '@pops/app-cerebrum',
            replacement: path.resolve(__dirname, '../../../pillars/cerebrum/app/src'),
          },
          {
            find: '@pops/app-finance',
            replacement: path.resolve(__dirname, '../../../pillars/finance/app/src'),
          },
          {
            find: '@pops/app-food',
            replacement: path.resolve(__dirname, '../../../pillars/food/app/src'),
          },
          {
            find: '@pops/app-inventory',
            replacement: path.resolve(__dirname, '../../../pillars/inventory/app/src'),
          },
          {
            find: '@pops/app-lists',
            replacement: path.resolve(__dirname, '../../../pillars/lists/app/src'),
          },
          {
            find: '@pops/app-media',
            replacement: path.resolve(__dirname, '../../../pillars/media/app/src'),
          },
        ],
      },
    });
  },
};
export default config;
