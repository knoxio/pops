import { Button } from './Button';
import { CRUDManagementSection } from './CRUDManagementSection';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof CRUDManagementSection> = {
  title: 'Layout/CRUDManagementSection',
  component: CRUDManagementSection,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithList: Story = {
  args: {
    title: 'Sources',
    description: 'Manage connected providers.',
    addLabel: 'Add source',
    onAdd: () => {},
    children: (
      <>
        <div className="rounded border p-3 text-sm">Item A</div>
        <div className="rounded border p-3 text-sm">Item B</div>
      </>
    ),
  },
};

export const WithInlineForm: Story = {
  args: {
    title: 'Dimensions',
    showForm: true,
    form: (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        Example inline form
      </div>
    ),
    children: (
      <div className="space-y-2">
        <Button variant="outline" className="w-full justify-start">
          Existing row
        </Button>
      </div>
    ),
  },
};
