import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { mergeConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        alias: {
          '@pops/ui': path.resolve(__dirname, '../../../packages/ui/src'),
          '@pops/app-media': path.resolve(__dirname, '../../../packages/app-media/src'),
          '@pops/app-finance': path.resolve(__dirname, '../../../packages/app-finance/src'),
          '@pops/app-inventory': path.resolve(__dirname, '../../../packages/app-inventory/src'),
        },
      },
    });
  },
};
export default config;
