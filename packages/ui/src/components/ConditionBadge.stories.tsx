import type { Meta, StoryObj } from '@storybook/react-vite';

import { ConditionBadge } from './ConditionBadge';

const meta: Meta<typeof ConditionBadge> = {
  title: 'Inventory/ConditionBadge',
  component: ConditionBadge,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Excellent: Story = {
  args: { condition: 'Excellent' },
};

export const Good: Story = {
  args: { condition: 'Good' },
};

export const Fair: Story = {
  args: { condition: 'Fair' },
};

export const Poor: Story = {
  args: { condition: 'Poor' },
};

export const AllConditions: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <ConditionBadge condition="Excellent" />
      <ConditionBadge condition="Good" />
      <ConditionBadge condition="Fair" />
      <ConditionBadge condition="Poor" />
    </div>
  ),
};
