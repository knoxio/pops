import { useState } from 'react';

import { EntitySelect } from './EntitySelect';

import type { Meta, StoryObj } from '@storybook/react-vite';

import type { EntityOption } from './EntitySelect';

const meta: Meta<typeof EntitySelect> = {
  title: 'Forms/EntitySelect',
  component: EntitySelect,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const ENTITIES: EntityOption[] = [
  { id: '1', name: 'Woolworths', type: 'merchant' },
  { id: '2', name: 'Netflix', type: 'subscription' },
  { id: '3', name: 'New Entity', type: 'merchant', pending: true },
  { id: '4', name: 'Coles', type: 'merchant' },
];

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState<string | undefined>(undefined);
    return (
      <div className="w-64">
        <EntitySelect entities={ENTITIES} value={value} onChange={(id) => setValue(id)} />
      </div>
    );
  },
};

export const WithPendingEntity: Story = {
  render: () => {
    const [value, setValue] = useState('3');
    return (
      <div className="w-64">
        <EntitySelect entities={ENTITIES} value={value} onChange={(id) => setValue(id)} />
      </div>
    );
  },
};

export const Disabled: Story = {
  args: {
    entities: ENTITIES,
    disabled: true,
  },
};
