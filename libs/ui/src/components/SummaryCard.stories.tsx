import { CheckCircle, XCircle } from 'lucide-react';

import { SummaryCard } from './SummaryCard';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof SummaryCard> = {
  title: 'Data Display/SummaryCard',
  component: SummaryCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  args: {
    icon: <CheckCircle className="w-5 h-5 text-success" />,
    value: 12,
    label: 'Entities Created',
    variant: 'success',
  },
};

export const Destructive: Story = {
  args: {
    icon: <XCircle className="w-5 h-5 text-destructive" />,
    value: 2,
    label: 'Transactions Failed',
    variant: 'destructive',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <SummaryCard
        icon={<CheckCircle className="w-5 h-5 text-success" />}
        value={10}
        label="Imported"
        variant="success"
      />
      <SummaryCard
        icon={<CheckCircle className="w-5 h-5 text-info" />}
        value={3}
        label="Rules Applied"
        variant="info"
      />
      <SummaryCard
        icon={<XCircle className="w-5 h-5 text-destructive" />}
        value={1}
        label="Failed"
        variant="destructive"
      />
      <SummaryCard
        icon={<CheckCircle className="w-5 h-5" />}
        value={0}
        label="Neutral"
        variant="neutral"
      />
    </div>
  ),
};
