import type { Preview } from '@storybook/react-vite';
import type { ReactRenderer } from '@storybook/react';
import { createElement, useEffect } from 'react';
import type { Decorator } from '@storybook/react';
import '@pops/ui/theme';

// Decorator to toggle dark class on HTML element for Tailwind dark mode
const withDarkMode: Decorator<ReactRenderer> = (Story, context) => {
  const isDark = context.globals.theme === 'dark';

  // Wrapper component to use React hooks
  const ThemeWrapper = () => {
    useEffect(() => {
      const html = document.documentElement;
      if (isDark) {
        html.classList.add('dark');
      } else {
        html.classList.remove('dark');
      }
    }, []);

    return createElement(Story);
  };

  return createElement(ThemeWrapper);
};

const preview: Preview = {
  decorators: [withDarkMode],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      disable: true,
    },
  },
  globalTypes: {
    theme: {
      description: 'Global theme for components',
      defaultValue: 'light',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', icon: 'sun', title: 'Light' },
          { value: 'dark', icon: 'moon', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
};

export default preview;