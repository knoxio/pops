import { Button } from './Button';
import { CardWithActionOverlay } from './CardWithActionOverlay';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof CardWithActionOverlay> = {
  title: 'Media/CardWithActionOverlay',
  component: CardWithActionOverlay,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Placeholder: Story = {
  args: {
    src: null,
    alt: 'No poster',
    className: 'max-w-[200px]',
    overlay: (
      <div className="pointer-events-auto flex justify-end gap-1">
        <Button size="sm" variant="secondary">
          Action
        </Button>
      </div>
    ),
  },
};

export const WithCornerBadge: Story = {
  args: {
    src: null,
    alt: 'Library item',
    className: 'max-w-[200px]',
    topLeft: (
      <span className="rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">4K</span>
    ),
    overlay: (
      <div className="pointer-events-auto flex justify-end gap-1">
        <Button size="sm">Watch</Button>
      </div>
    ),
  },
};
