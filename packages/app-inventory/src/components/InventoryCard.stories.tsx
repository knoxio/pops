import type { Meta, StoryObj } from "@storybook/react-vite";
import { InventoryCard } from "./InventoryCard";

const meta: Meta<typeof InventoryCard> = {
  title: "Inventory/InventoryCard",
  component: InventoryCard,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    id: "1",
    itemName: "MacBook Pro 16″",
    brand: "Apple",
    model: "M3 Max",
    assetId: "INV-001",
    type: "Electronics",
    condition: "Excellent",
    locationSegments: [
      { id: "1", name: "Office" },
      { id: "2", name: "Standing Desk" },
    ],
  },
};

export const MinimalInfo: Story = {
  args: {
    id: "2",
    itemName: "IKEA Bookshelf",
  },
};

export const WithPhoto: Story = {
  args: {
    id: "3",
    itemName: "Sony WH-1000XM5",
    brand: "Sony",
    type: "Electronics",
    condition: "Good",
    photoUrl: "https://placehold.co/128x128/1a1a1a/white?text=XM5",
    locationSegments: [{ id: "1", name: "Bedroom" }],
  },
};

export const PoorCondition: Story = {
  args: {
    id: "4",
    itemName: "Old Vacuum Cleaner",
    brand: "Dyson",
    model: "V8",
    assetId: "INV-099",
    type: "Appliance",
    condition: "Poor",
    locationSegments: [
      { id: "1", name: "Garage" },
      { id: "2", name: "Storage" },
      { id: "3", name: "Back Corner" },
    ],
  },
};

export const ClickableCard: Story = {
  args: {
    id: "5",
    itemName: "Standing Desk",
    brand: "Uplift",
    model: "V2",
    assetId: "INV-015",
    type: "Furniture",
    condition: "Good",
    locationSegments: [{ id: "1", name: "Office" }],
    onClick: (id) => alert(`Navigate to item ${id}`),
    onLocationNavigate: (seg) => alert(`Navigate to ${seg.name}`),
  },
};

export const GridLayout: Story = {
  render: () => (
    <div className="grid grid-cols-1 gap-3 w-[400px]">
      <InventoryCard
        id="1"
        itemName="MacBook Pro 16″"
        brand="Apple"
        model="M3 Max"
        assetId="INV-001"
        type="Electronics"
        condition="Excellent"
        locationSegments={[
          { id: "1", name: "Office" },
          { id: "2", name: "Desk" },
        ]}
      />
      <InventoryCard
        id="2"
        itemName="Sony TV 65″"
        brand="Sony"
        model="A95L"
        assetId="INV-010"
        type="Electronics"
        condition="Good"
        locationSegments={[{ id: "1", name: "Living Room" }]}
      />
      <InventoryCard
        id="3"
        itemName="Coffee Machine"
        brand="Breville"
        model="Barista Express"
        type="Appliance"
        condition="Fair"
        locationSegments={[{ id: "1", name: "Kitchen" }]}
      />
    </div>
  ),
};
