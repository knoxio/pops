import { useState } from 'react';

import { EditableCell } from './EditableCell';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof EditableCell> = {
  title: 'Data Display/EditableCell',
  component: EditableCell,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

type WrapperProps = Omit<React.ComponentProps<typeof EditableCell>, 'onSave'>;

function EditableCellWrapper(props: WrapperProps) {
  const [value, setValue] = useState(props.value);
  return (
    <div className="w-64">
      <EditableCell
        {...props}
        value={value}
        onSave={(v) => {
          setValue(v);
          return Promise.resolve();
        }}
      />
    </div>
  );
}

export const DisplayMode: Story = {
  render: () => (
    <div className="w-64">
      <EditableCell value="Click to edit" onSave={() => {}} />
    </div>
  ),
};

export const TextEdit: Story = {
  render: () => <EditableCellWrapper value="Editable text" type="text" />,
};

export const NumberEdit: Story = {
  render: () => <EditableCellWrapper value={42} type="number" />,
};

export const DateEdit: Story = {
  render: () => <EditableCellWrapper value="2024-06-15" type="date" placeholder="YYYY-MM-DD" />,
};

export const SelectEdit: Story = {
  render: () => (
    <EditableCellWrapper
      value="active"
      type="select"
      options={[
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
        { label: 'Pending', value: 'pending' },
      ]}
    />
  ),
};

export const ValidationError: Story = {
  render: () => (
    <div className="w-64">
      <EditableCell
        value=""
        type="text"
        placeholder="Required field"
        validate={(v) => (String(v).trim().length > 0 ? true : 'Value is required')}
        onSave={() => {}}
      />
    </div>
  ),
};

export const SavingState: Story = {
  render: () => (
    <div className="w-64">
      <EditableCell
        value="Slow save"
        type="text"
        onSave={() => new Promise((resolve) => setTimeout(resolve, 3000))}
      />
    </div>
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <div className="w-64">
      <EditableCell value="Read-only value" editable={false} onSave={() => {}} />
    </div>
  ),
};
