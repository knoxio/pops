import { Film, Package, Star } from 'lucide-react';

import { Badge } from '../primitives/badge';
import { SearchResultItem } from './SearchResultItem';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof SearchResultItem> = {
  title: 'Layout/SearchResultItem',
  component: SearchResultItem,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const TitleOnly: Story = {
  args: {
    title: 'MacBook Pro 14"',
  },
};

export const WithMeta: Story = {
  args: {
    title: 'The Shawshank Redemption',
    meta: [
      <span key="year">1994</span>,
      <span key="rating" className="flex items-center gap-0.5">
        <Star className="h-3 w-3 fill-warning text-warning" />
        9.3
      </span>,
      <span key="runtime">142m</span>,
    ],
  },
};

export const WithLeading: Story = {
  args: {
    leading: (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
        <Package className="h-5 w-5 opacity-50" />
      </div>
    ),
    title: 'Sony Headphones WH-1000XM5',
    meta: [<span key="brand">Sony</span>, <span key="location">Living Room · Storage</span>],
    trailing: <span className="shrink-0 text-xs font-medium text-muted-foreground">$549.00</span>,
  },
};

export const WithPosterLeading: Story = {
  args: {
    leading: (
      <div className="flex h-12 w-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
        <Film className="h-4 w-4 opacity-40" />
      </div>
    ),
    title: 'Inception',
    meta: [<span key="year">2010</span>, <span key="runtime">148m</span>],
  },
};

export const WithTrailingBadge: Story = {
  args: {
    title: 'Anthropic',
    meta: [<span key="aliases">Anthropic PBC, Anthropic AI</span>],
    trailing: (
      <Badge variant="outline" className="shrink-0 text-2xs uppercase tracking-wider">
        company
      </Badge>
    ),
  },
};

export const TitleHighlighted: Story = {
  args: {
    title: (
      <span>
        Mac<mark className="bg-warning/30 rounded-sm px-0.5">Book</mark> Pro 14&quot;
      </span>
    ),
    meta: [<span key="brand">Apple</span>, <span key="location">Office</span>],
    trailing: <span className="shrink-0 text-xs font-medium text-muted-foreground">$3,499.00</span>,
  },
};
