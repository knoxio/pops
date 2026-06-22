import { LoadingProgressStep } from './LoadingProgressStep';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof LoadingProgressStep> = {
  title: 'Feedback/LoadingProgressStep',
  component: LoadingProgressStep,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Processing',
    message: 'Analyzing 42 transactions…',
  },
};

export const WithProgress: Story = {
  args: {
    title: 'Processing',
    message: 'Processing 21/42 transactions…',
    progress: 50,
    steps: [
      { label: 'Checking for duplicates', status: 'done' },
      { label: 'Matching entities', status: 'in_progress' },
    ],
  },
};

export const Done: Story = {
  args: {
    title: 'Already processed',
    message: 'Your transactions are ready for review.',
    done: true,
  },
};

export const WithErrors: Story = {
  args: {
    title: 'Processing',
    message: 'Processing with warnings…',
    errors: ['Entity lookup failed for: WOOLWORTHS 1234', 'Entity lookup failed for: NETFLIX AU'],
  },
};
