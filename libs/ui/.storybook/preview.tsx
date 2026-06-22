import '@pops/ui/theme';

import type { Preview } from '@storybook/react-vite';

const APP_COLOURS = [
  { value: 'app-emerald', title: 'Emerald', left: '🟢' },
  { value: 'app-indigo', title: 'Indigo', left: '🔵' },
  { value: 'app-amber', title: 'Amber', left: '🟡' },
  { value: 'app-rose', title: 'Rose', left: '🔴' },
  { value: 'app-sky', title: 'Sky', left: '🩵' },
  { value: 'app-violet', title: 'Violet', left: '🟣' },
];

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Toggle light / dark mode',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
    appColour: {
      description: 'App accent colour',
      toolbar: {
        title: 'App Colour',
        icon: 'paintbrush',
        items: APP_COLOURS,
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
    appColour: 'app-emerald',
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme ?? 'light';
      const appColour = context.globals.appColour ?? 'app-emerald';
      const classes = [appColour];
      if (theme === 'dark') classes.push('dark');

      return (
        <div
          className={classes.join(' ')}
          style={{
            padding: '1rem',
            backgroundColor: 'var(--background)',
            color: 'var(--foreground)',
            minHeight: '100%',
          }}
        >
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
