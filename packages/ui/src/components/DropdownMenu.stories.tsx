import type { Meta, StoryObj } from "@storybook/react-vite";
import { DropdownMenu } from "./DropdownMenu";
import { Button } from "./Button";

const meta: Meta<typeof DropdownMenu> = {
  title: "Navigation/DropdownMenu",
  component: DropdownMenu,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ padding: "4rem" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const EditIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const TrashIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const CopyIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

export const Default: Story = {
  args: {
    trigger: <Button variant="outline">Open Menu</Button>,
    items: [
      {
        label: "Edit",
        value: "edit",
        icon: <EditIcon />,
        onSelect: () => alert("Edit clicked"),
      },
      {
        label: "Duplicate",
        value: "duplicate",
        icon: <CopyIcon />,
        onSelect: () => alert("Duplicate clicked"),
      },
      {
        label: "Delete",
        value: "delete",
        icon: <TrashIcon />,
        variant: "destructive",
        onSelect: () => alert("Delete clicked"),
      },
    ],
  },
};

export const AlignEnd: Story = {
  args: {
    trigger: (
      <Button variant="outline" size="lg">
        Align End (Wide Button)
      </Button>
    ),
    align: "end",
    items: [
      { label: "Profile", value: "profile" },
      { label: "Settings", value: "settings" },
      { label: "Sign out", value: "signout", variant: "destructive" },
    ],
  },
};

export const AlignCenter: Story = {
  args: {
    trigger: (
      <Button variant="outline" size="lg">
        Align Center (Wide Button)
      </Button>
    ),
    align: "center",
    items: [
      { label: "Profile", value: "profile" },
      { label: "Settings", value: "settings" },
    ],
  },
};

export const WithDisabledItems: Story = {
  args: {
    trigger: <Button variant="outline">Menu with Disabled</Button>,
    items: [
      { label: "Available", value: "available" },
      { label: "Disabled", value: "disabled", disabled: true },
      { label: "Also Available", value: "also-available" },
    ],
  },
};

export const SideTop: Story = {
  args: {
    trigger: <Button variant="outline">Open Upward</Button>,
    side: "top",
    items: [
      { label: "Option 1", value: "1" },
      { label: "Option 2", value: "2" },
      { label: "Option 3", value: "3" },
      { label: "Option 4", value: "4" },
      { label: "Option 5", value: "5" },
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ paddingTop: "12rem", paddingBottom: "2rem" }}>
        <Story />
      </div>
    ),
  ],
};
