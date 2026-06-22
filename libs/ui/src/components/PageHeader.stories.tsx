import { MapPin, ShieldCheck } from 'lucide-react';

import { Button } from './Button';
import { PageHeader } from './PageHeader';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof PageHeader> = {
  title: 'Layout/PageHeader',
  component: PageHeader,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const TopLevel: Story = {
  args: {
    title: 'Dashboard',
  },
};

export const TopLevelWithDescription: Story = {
  args: {
    title: 'Budgets',
    description: '12 total budgets',
  },
};

export const TopLevelWithActions: Story = {
  args: {
    title: 'Movies',
    actions: <Button size="sm">Add Movie</Button>,
  },
};

export const TopLevelFull: Story = {
  name: 'Top Level (title + description + actions)',
  args: {
    title: 'Entities',
    description: 'Manage merchants and payees',
    actions: <Button size="sm">Add Entity</Button>,
  },
};

export const DrillDown: Story = {
  args: {
    title: 'The Shawshank Redemption',
    backHref: '/media',
    breadcrumbs: [{ label: 'Media', href: '/media' }, { label: 'The Shawshank Redemption' }],
  },
};

export const ThreeLevels: Story = {
  args: {
    title: 'Season 1',
    backHref: '/media/shows/1',
    breadcrumbs: [
      { label: 'Media', href: '/media' },
      { label: 'Breaking Bad', href: '/media/shows/1' },
      { label: 'Season 1' },
    ],
  },
};

export const FourLevels: Story = {
  name: 'Four Levels (mobile collapse)',
  args: {
    title: 'Episode 3',
    backHref: '/media/shows/1/seasons/1',
    breadcrumbs: [
      { label: 'Media', href: '/media' },
      { label: 'Breaking Bad', href: '/media/shows/1' },
      { label: 'Season 1', href: '/media/shows/1/seasons/1' },
      { label: 'Episode 3' },
    ],
  },
};

export const WithIcon: Story = {
  args: {
    title: 'Locations',
    icon: <MapPin className="h-6 w-6 text-muted-foreground" />,
  },
};

export const WithIconAndActions: Story = {
  args: {
    title: 'Warranty Tracking',
    icon: (
      <div className="p-2 rounded-xl bg-primary/10">
        <ShieldCheck className="h-6 w-6 text-primary" />
      </div>
    ),
    actions: <Button size="sm">Add Item</Button>,
  },
};

export const WithActions: Story = {
  args: {
    title: 'MacBook Pro 14',
    backHref: '/inventory',
    breadcrumbs: [{ label: 'Inventory', href: '/inventory' }, { label: 'MacBook Pro 14' }],
    actions: (
      <Button size="sm" variant="outline">
        Edit
      </Button>
    ),
  },
};
