import { CompletionSummary } from './CompletionSummary';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof CompletionSummary> = {
  title: 'Media/CompletionSummary',
  component: CompletionSummary,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const sampleData = {
  sessionId: 1,
  movieTitle: 'The Matrix',
  dimensions: [
    { dimensionId: 1, name: 'Pacing', status: 'complete' as const, comparisonId: 10 },
    { dimensionId: 2, name: 'Score', status: 'complete' as const, comparisonId: null },
    { dimensionId: 3, name: 'Rewatch', status: 'pending' as const, comparisonId: null },
  ],
};

export const Default: Story = {
  args: {
    data: sampleData,
    onDone: () => {},
    onDoAnother: () => {},
  },
};

export const WithoutDoAnother: Story = {
  args: {
    data: sampleData,
    onDone: () => {},
  },
};
