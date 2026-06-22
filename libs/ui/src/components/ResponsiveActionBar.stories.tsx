import { TooltipProvider } from '../primitives/tooltip';
import { ResponsiveActionBar } from './ResponsiveActionBar';

import type { Meta, StoryObj } from '@storybook/react-vite';

const noop = () => {};

const meta: Meta<typeof ResponsiveActionBar> = {
  title: 'Media/ResponsiveActionBar',
  component: ResponsiveActionBar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
  args: {
    movieA: { id: 1, title: 'The Matrix' },
    movieB: { id: 2, title: 'Inception' },
    onSkip: noop,
    onStale: noop,
    onNA: noop,
    onBlacklist: noop,
    onDone: noop,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
