import type { Meta, StoryObj } from '@storybook/react-vite';

import { LocationBreadcrumb } from './LocationBreadcrumb';

const meta: Meta<typeof LocationBreadcrumb> = {
  title: 'Inventory/LocationBreadcrumb',
  component: LocationBreadcrumb,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleLevel: Story = {
  args: {
    segments: [{ id: '1', name: 'Living Room' }],
  },
};

export const TwoLevels: Story = {
  args: {
    segments: [
      { id: '1', name: 'Living Room' },
      { id: '2', name: 'TV Cabinet' },
    ],
  },
};

export const ThreeLevels: Story = {
  args: {
    segments: [
      { id: '1', name: 'Garage' },
      { id: '2', name: 'Shelf Unit A' },
      { id: '3', name: 'Top Shelf' },
    ],
  },
};

export const Clickable: Story = {
  args: {
    segments: [
      { id: '1', name: 'House' },
      { id: '2', name: 'Office' },
      { id: '3', name: 'Desk Drawer' },
    ],
    onNavigate: (segment) => alert(`Navigate to: ${segment.name} (${segment.id})`),
  },
};

export const Empty: Story = {
  args: {
    segments: [],
  },
};
