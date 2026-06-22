import { useState } from 'react';

import { Button } from './Button';
import { ConditionalModalButton } from './ConditionalModalButton';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof ConditionalModalButton> = {
  title: 'Layout/ConditionalModalButton',
  component: ConditionalModalButton,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithModalMounted: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <ConditionalModalButton
        when
        modal={
          open ? (
            <div
              role="dialog"
              aria-label="Example modal"
              className="mt-2 rounded-md border bg-card p-3 text-sm shadow-md"
            >
              <p className="text-muted-foreground mb-2">
                Modal subtree is a sibling of the trigger.
              </p>
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          ) : null
        }
      >
        <Button size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide panel' : 'Show panel'}
        </Button>
      </ConditionalModalButton>
    );
  },
};

export const WhenFalseSkipsModal: Story = {
  render: () => (
    <ConditionalModalButton when={false} modal={<div data-testid="should-not-exist">Never</div>}>
      <Button size="sm" variant="secondary">
        Trigger only
      </Button>
    </ConditionalModalButton>
  ),
};
