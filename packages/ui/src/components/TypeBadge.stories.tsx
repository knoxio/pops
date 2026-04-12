import type { Meta, StoryObj } from '@storybook/react-vite';

import { TypeBadge } from './TypeBadge';

const meta: Meta<typeof TypeBadge> = {
  title: 'Inventory/TypeBadge',
  component: TypeBadge,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Electronics: Story = {
  args: { type: 'Electronics' },
};

export const Furniture: Story = {
  args: { type: 'Furniture' },
};

export const Appliance: Story = {
  args: { type: 'Appliance' },
};

export const Tool: Story = {
  args: { type: 'Tool' },
};

export const AllTypes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <TypeBadge type="Electronics" />
      <TypeBadge type="Furniture" />
      <TypeBadge type="Appliance" />
      <TypeBadge type="Tool" />
      <TypeBadge type="Kitchen" />
      <TypeBadge type="Clothing" />
    </div>
  ),
};
