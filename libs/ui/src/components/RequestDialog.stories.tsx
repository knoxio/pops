import { useState } from 'react';

import { Button } from './Button';
import { RequestDialog } from './RequestDialog';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof RequestDialog> = {
  title: 'Overlays/RequestDialog',
  component: RequestDialog,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open</Button>
        <RequestDialog
          open={open}
          onClose={() => setOpen(false)}
          title="Request movie"
          description="Pick a quality profile and confirm."
          canSubmit
          isPending={false}
          isSuccess={false}
          onSubmit={() => setOpen(false)}
        >
          <p className="text-sm text-muted-foreground">Form body would go here.</p>
        </RequestDialog>
      </>
    );
  },
};
