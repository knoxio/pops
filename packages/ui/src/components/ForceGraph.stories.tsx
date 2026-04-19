import { ForceGraph } from './ForceGraph';

import type { Meta, StoryObj } from '@storybook/react';

const meta = {
  title: 'ui/ForceGraph',
  component: ForceGraph,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ForceGraph>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    height: 520,
    enableZoom: true,
    nodes: [
      { id: 'a', label: 'A', color: '#22c55e', radius: 10, x: -120, y: 0 },
      { id: 'b', label: 'B', color: '#3b82f6', radius: 10, x: 0, y: 90 },
      { id: 'c', label: 'C', color: '#f59e0b', radius: 10, x: 120, y: 0 },
      { id: 'd', label: 'D', color: '#ef4444', radius: 10, x: 0, y: -90 },
      { id: 'e', label: 'E', color: '#a855f7', radius: 10, x: 0, y: 0 },
    ],
    edges: [
      { source: 'a', target: 'e' },
      { source: 'b', target: 'e' },
      { source: 'c', target: 'e' },
      { source: 'd', target: 'e' },
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'd' },
      { source: 'd', target: 'a' },
    ],
  },
  render: (args: React.ComponentProps<typeof ForceGraph>) => (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <ForceGraph {...args} />
      <p style={{ marginTop: 12, opacity: 0.75, fontSize: 12 }}>
        Drag nodes, pan the canvas, and zoom with the wheel.
      </p>
    </div>
  ),
};
