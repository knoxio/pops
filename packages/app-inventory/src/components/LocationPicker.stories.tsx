import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { LocationPicker, type LocationTreeNode } from './LocationPicker';

const mockLocations: LocationTreeNode[] = [
  {
    id: '1',
    name: 'House',
    parentId: null,
    children: [
      {
        id: '2',
        name: 'Living Room',
        parentId: '1',
        children: [
          { id: '6', name: 'TV Cabinet', parentId: '2', children: [] },
          { id: '7', name: 'Bookshelf', parentId: '2', children: [] },
        ],
      },
      {
        id: '3',
        name: 'Office',
        parentId: '1',
        children: [
          { id: '8', name: 'Standing Desk', parentId: '3', children: [] },
          { id: '9', name: 'Filing Cabinet', parentId: '3', children: [] },
        ],
      },
      {
        id: '4',
        name: 'Kitchen',
        parentId: '1',
        children: [{ id: '10', name: 'Pantry', parentId: '4', children: [] }],
      },
      { id: '5', name: 'Bedroom', parentId: '1', children: [] },
    ],
  },
  {
    id: '11',
    name: 'Garage',
    parentId: null,
    children: [
      {
        id: '12',
        name: 'Storage Shelf',
        parentId: '11',
        children: [
          { id: '13', name: 'Top Shelf', parentId: '12', children: [] },
          { id: '14', name: 'Bottom Shelf', parentId: '12', children: [] },
        ],
      },
      { id: '15', name: 'Workbench', parentId: '11', children: [] },
    ],
  },
];

const meta: Meta<typeof LocationPicker> = {
  title: 'Inventory/LocationPicker',
  component: LocationPicker,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[300px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    locations: mockLocations,
    value: null,
  },
};

export const WithSelection: Story = {
  args: {
    locations: mockLocations,
    value: '8',
  },
};

export const Interactive: Story = {
  render: function Render() {
    const [value, setValue] = useState<string | null>('6');
    return (
      <LocationPicker
        locations={mockLocations}
        value={value}
        onChange={setValue}
        onCreateLocation={(name, parentId) => alert(`Create "${name}" under ${parentId ?? 'root'}`)}
      />
    );
  },
};

export const EmptyTree: Story = {
  args: {
    locations: [],
    value: null,
  },
};

export const Disabled: Story = {
  args: {
    locations: mockLocations,
    value: '3',
    disabled: true,
  },
};

export const WithAddLocation: Story = {
  args: {
    locations: mockLocations,
    value: null,
    onCreateLocation: (name, parentId) => alert(`Create "${name}" under ${parentId ?? 'root'}`),
  },
};
