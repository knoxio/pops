import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConnectionsList } from "./ConnectionsList";

const meta: Meta<typeof ConnectionsList> = {
  title: "Inventory/ConnectionsList",
  component: ConnectionsList,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[360px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithConnections: Story = {
  args: {
    connections: [
      { id: "1", itemName: "USB-C Hub", assetId: "INV-022", type: "Electronics" },
      { id: "2", itemName: "Monitor Stand", assetId: "INV-015", type: "Furniture" },
      { id: "3", itemName: "Keyboard", type: "Electronics" },
    ],
    onItemClick: (id) => alert(`Navigate to item ${id}`),
    onConnect: () => alert("Open connect dialog"),
  },
};

export const Empty: Story = {
  args: {
    connections: [],
    onConnect: () => alert("Open connect dialog"),
  },
};

export const ReadOnly: Story = {
  args: {
    connections: [
      { id: "1", itemName: "Charger", assetId: "INV-050", type: "Electronics" },
      { id: "2", itemName: "Carrying Case", type: "Accessory" },
    ],
  },
};

export const ManyConnections: Story = {
  args: {
    connections: [
      { id: "1", itemName: "MacBook Pro 16″", assetId: "INV-001", type: "Electronics" },
      { id: "2", itemName: "USB-C Hub", assetId: "INV-022", type: "Electronics" },
      { id: "3", itemName: "External SSD", assetId: "INV-033", type: "Electronics" },
      { id: "4", itemName: "Monitor", assetId: "INV-010", type: "Electronics" },
      { id: "5", itemName: "Desk Mat", type: "Accessory" },
      { id: "6", itemName: "Webcam", assetId: "INV-041", type: "Electronics" },
    ],
    onItemClick: (id) => alert(`Navigate to item ${id}`),
    onConnect: () => alert("Open connect dialog"),
  },
};
