import { ConditionBadge } from './ConditionBadge';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof ConditionBadge> = {
  title: 'Inventory/ConditionBadge',
  component: ConditionBadge,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const New: Story = {
  args: { condition: 'new' },
};

export const Good: Story = {
  args: { condition: 'good' },
};

export const Fair: Story = {
  args: { condition: 'fair' },
};

export const Poor: Story = {
  args: { condition: 'poor' },
};

export const Broken: Story = {
  args: { condition: 'broken' },
};

export const LegacyExcellent: Story = {
  name: 'Legacy: Excellent (alias for good)',
  args: { condition: 'Excellent' },
};

export const AllConditions: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <ConditionBadge condition="new" />
      <ConditionBadge condition="good" />
      <ConditionBadge condition="fair" />
      <ConditionBadge condition="poor" />
      <ConditionBadge condition="broken" />
    </div>
  ),
};
