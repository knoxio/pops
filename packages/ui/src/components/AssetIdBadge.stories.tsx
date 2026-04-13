import type { Meta, StoryObj } from '@storybook/react-vite';

import { AssetIdBadge } from './AssetIdBadge';

const meta: Meta<typeof AssetIdBadge> = {
  title: 'Inventory/AssetIdBadge',
  component: AssetIdBadge,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { assetId: 'INV-001' },
};

export const LongId: Story = {
  args: { assetId: 'ASSET-2026-0042' },
};

export const NumericId: Story = {
  args: { assetId: '00847' },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <AssetIdBadge assetId="INV-001" />
      <AssetIdBadge assetId="INV-042" />
      <AssetIdBadge assetId="ASSET-2026-0100" />
      <AssetIdBadge assetId="00123" />
    </div>
  ),
};
