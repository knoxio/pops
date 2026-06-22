import { Inbox } from 'lucide-react';

import { EmptyStateTab } from './EmptyStateTab';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof EmptyStateTab> = {
  title: 'Feedback/EmptyStateTab',
  component: EmptyStateTab,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    message: 'No items found.',
  },
};

export const WithIcon: Story = {
  args: {
    message: 'No transactions matched.',
    icon: <Inbox className="w-8 h-8" />,
  },
};
