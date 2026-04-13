import type { Meta, StoryObj } from '@storybook/react-vite';

import { Skeleton } from './skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'Data Display/Skeleton',
  component: Skeleton,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    className: 'h-12 w-12',
  },
};

export const Circle: Story = {
  args: {
    className: 'h-12 w-12 rounded-full',
  },
};

export const Rectangle: Story = {
  args: {
    className: 'h-24 w-full',
  },
};

export const Text: Story = {
  args: {},
  render: () => (
    <div className="space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-4/6" />
    </div>
  ),
};

export const Card: Story = {
  args: {},
  render: () => (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-32 w-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    </div>
  ),
};

export const TransactionList: Story = {
  args: {},
  render: () => (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  ),
};

export const Table: Story = {
  args: {},
  render: () => (
    <div className="rounded-lg border">
      <div className="border-b bg-muted/50 p-3">
        <div className="flex gap-4">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="h-4 w-1/6" />
        </div>
      </div>
      <div className="divide-y">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="p-3">
            <div className="flex gap-4">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-4 w-1/6" />
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
};

export const Dashboard: Story = {
  args: {},
  render: () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border p-6 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-6 space-y-4">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-64 w-full" />
        </div>

        <div className="rounded-lg border p-6 space-y-4">
          <Skeleton className="h-6 w-1/3" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  ),
};

export const Form: Story = {
  args: {},
  render: () => (
    <div className="space-y-6 max-w-md">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  ),
};

export const Profile: Story = {
  args: {},
  render: () => (
    <div className="space-y-6 max-w-md">
      <div className="flex items-center gap-4">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  ),
};

export const BudgetWidget: Story = {
  args: {},
  render: () => (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>

      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ))}

      <div className="pt-2 flex justify-between">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-32" />
      </div>
    </div>
  ),
};

export const Chart: Story = {
  args: {},
  render: () => (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <Skeleton className="h-64 w-full" />
      <div className="flex justify-center gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  ),
};
