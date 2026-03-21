import { mergeConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../../packages/*/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../../apps/*/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
    '@chromatic-com/storybook',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  async viteFinal(config) {
    return mergeConfig(config, {
      plugins: [tailwindcss()],
      resolve: {
        alias: {
          '@pops/ui': path.resolve(__dirname, '../src'),
          '@pops/app-media': path.resolve(__dirname, '../../app-media/src'),
          '@pops/app-finance': path.resolve(__dirname, '../../app-finance/src'),
        },
      },
    });
  },
};
export default config;
