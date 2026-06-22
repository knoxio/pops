import { Button } from './Button';
import { EditableFormCard } from './EditableFormCard';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof EditableFormCard> = {
  title: 'Forms/EditableFormCard',
  component: EditableFormCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Edit Transaction',
    children: <p className="text-sm text-muted-foreground">Form fields go here.</p>,
  },
};

export const WithActions: Story = {
  args: {
    title: 'Edit Transaction',
    actions: (
      <>
        <Button variant="ghost" size="sm">
          Cancel
        </Button>
        <Button size="sm">Save</Button>
      </>
    ),
    children: <p className="text-sm text-muted-foreground">Form fields go here.</p>,
  },
};

export const NoTitle: Story = {
  args: {
    children: <p className="text-sm text-muted-foreground">Content without a header.</p>,
  },
};
