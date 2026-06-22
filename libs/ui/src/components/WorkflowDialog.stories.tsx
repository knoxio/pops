import { useState } from 'react';

import { Button } from './Button';
import { WorkflowDialog } from './WorkflowDialog';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof WorkflowDialog> = {
  title: 'Overlays/WorkflowDialog',
  component: WorkflowDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoColumn: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Dialog</Button>
        <WorkflowDialog
          open={open}
          onOpenChange={setOpen}
          title="Two-Column Workflow"
          description="A wide dialog with a 2-column layout."
          columns={2}
          footer={
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setOpen(false)}>Apply</Button>
            </>
          }
        >
          <div className="p-6 border-r">
            <p className="text-sm text-muted-foreground">Left panel content</p>
          </div>
          <div className="p-6">
            <p className="text-sm text-muted-foreground">Right panel content</p>
          </div>
        </WorkflowDialog>
      </>
    );
  },
};

export const FreeForm: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Dialog</Button>
        <WorkflowDialog
          open={open}
          onOpenChange={setOpen}
          title="Loading State"
          footer={
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          }
        >
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            Free-form content area (no columns grid).
          </div>
        </WorkflowDialog>
      </>
    );
  },
};
