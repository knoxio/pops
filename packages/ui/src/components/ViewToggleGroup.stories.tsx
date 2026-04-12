import type { Meta, StoryObj } from '@storybook/react-vite';
import { LayoutGrid, LayoutList, Map, Table } from 'lucide-react';

import { ViewToggleGroup } from './ViewToggleGroup';

const meta: Meta<typeof ViewToggleGroup> = {
  title: 'Layout/ViewToggleGroup',
  component: ViewToggleGroup,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const TableGrid: Story = {
  args: {
    options: [
      {
        value: 'table',
        label: 'Table view',
        icon: <LayoutList className="h-4 w-4" />,
      },
      {
        value: 'grid',
        label: 'Grid view',
        icon: <LayoutGrid className="h-4 w-4" />,
      },
    ],
    defaultValue: 'table',
  },
};

export const ThreeOptions: Story = {
  args: {
    options: [
      {
        value: 'table',
        label: 'Table view',
        icon: <Table className="h-4 w-4" />,
      },
      {
        value: 'grid',
        label: 'Grid view',
        icon: <LayoutGrid className="h-4 w-4" />,
      },
      {
        value: 'map',
        label: 'Map view',
        icon: <Map className="h-4 w-4" />,
      },
    ],
    defaultValue: 'table',
  },
};

export const WithPersistence: Story = {
  args: {
    options: [
      {
        value: 'table',
        label: 'Table view',
        icon: <LayoutList className="h-4 w-4" />,
      },
      {
        value: 'grid',
        label: 'Grid view',
        icon: <LayoutGrid className="h-4 w-4" />,
      },
    ],
    storageKey: 'storybook-view-mode',
    defaultValue: 'table',
  },
};
