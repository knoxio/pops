import { ActionGroup } from './ActionGroup';
import { Button } from './Button';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof ActionGroup> = {
  title: 'Layout/ActionGroup',
  component: ActionGroup,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <ActionGroup {...args}>
      <Button size="sm" variant="outline">
        One
      </Button>
      <Button size="sm" variant="outline">
        Two
      </Button>
    </ActionGroup>
  ),
};
