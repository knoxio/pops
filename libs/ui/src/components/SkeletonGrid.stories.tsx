import { SkeletonGrid } from './SkeletonGrid';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof SkeletonGrid> = {
  title: 'Feedback/SkeletonGrid',
  component: SkeletonGrid,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const FourColumns: Story = {
  args: {
    count: 4,
    itemHeight: 'h-32',
    cols: 'sm:grid-cols-2 lg:grid-cols-4',
  },
};

export const ThreeColumns: Story = {
  args: {
    count: 3,
    itemHeight: 'h-32',
    cols: 'md:grid-cols-3',
  },
};

export const SingleColumn: Story = {
  args: {
    count: 3,
    itemHeight: 'h-16',
    cols: 'grid-cols-1',
    gap: 'gap-3',
  },
};
