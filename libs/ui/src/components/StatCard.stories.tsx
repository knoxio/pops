import { StatCard } from './StatCard';

import type { Meta, StoryObj } from '@storybook/react-vite';

import type { StatCardColor } from './StatCard';

const meta: Meta<typeof StatCard> = {
  title: 'Data Display/StatCard',
  component: StatCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    color: {
      control: 'select',
      options: [
        'slate',
        'emerald',
        'rose',
        'indigo',
        'amber',
        'sky',
        'violet',
      ] satisfies StatCardColor[],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Total Revenue',
    value: '$12,450',
    description: 'Last 30 days',
    color: 'slate',
  },
};

export const AllColourVariants: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {(
        [
          { color: 'slate', title: 'Slate', value: '$1,200' },
          { color: 'emerald', title: 'Emerald', value: '$3,450' },
          { color: 'rose', title: 'Rose', value: '$890' },
          { color: 'indigo', title: 'Indigo', value: '142' },
          { color: 'amber', title: 'Amber', value: '78%' },
          { color: 'sky', title: 'Sky', value: '24 items' },
          { color: 'violet', title: 'Violet', value: '99.9%' },
        ] satisfies { color: StatCardColor; title: string; value: string }[]
      ).map(({ color, title, value }) => (
        <StatCard
          key={color}
          color={color}
          title={title}
          value={value}
          description="Last 30 days"
        />
      ))}
    </div>
  ),
};

export const WithTrendUp: Story = {
  args: {
    title: 'Monthly Revenue',
    value: '$12,450',
    description: 'vs. last month',
    color: 'emerald',
    trend: { value: 12.5, direction: 'up' },
  },
};

export const WithTrendDown: Story = {
  args: {
    title: 'Churn Rate',
    value: '3.2%',
    description: 'vs. last month',
    color: 'rose',
    trend: { value: 1.8, direction: 'down' },
  },
};

export const WithTrendNeutral: Story = {
  args: {
    title: 'Active Users',
    value: '1,024',
    description: 'vs. last month',
    color: 'indigo',
    trend: { value: 0.0, direction: 'neutral' },
  },
};

export const AllVariantsWithTrend: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <StatCard
        color="emerald"
        title="Revenue"
        value="$12,450"
        description="Last 30 days"
        trend={{ value: 12.5, direction: 'up' }}
      />
      <StatCard
        color="rose"
        title="Expenses"
        value="$4,320"
        description="Last 30 days"
        trend={{ value: 5.2, direction: 'down' }}
      />
      <StatCard
        color="indigo"
        title="Transactions"
        value="142"
        description="Last 30 days"
        trend={{ value: 0.0, direction: 'neutral' }}
      />
      <StatCard
        color="amber"
        title="Pending"
        value="78%"
        description="Approval rate"
        trend={{ value: 3.1, direction: 'up' }}
      />
      <StatCard
        color="sky"
        title="Inventory"
        value="24 items"
        description="In stock"
        trend={{ value: 8.0, direction: 'down' }}
      />
      <StatCard
        color="violet"
        title="Uptime"
        value="99.9%"
        description="Last 30 days"
        trend={{ value: 0.1, direction: 'up' }}
      />
      <StatCard color="slate" title="Storage" value="48 GB" description="Used of 100 GB" />
    </div>
  ),
};

export const WithoutDescription: Story = {
  args: {
    title: 'Net Worth',
    value: '$84,320',
    color: 'emerald',
    trend: { value: 7.3, direction: 'up' },
  },
};
