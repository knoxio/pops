/**
 * Chip component stories
 * Demonstrates all variants, sizes, removable options, and use cases
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Chip } from "./Chip";

const meta: Meta<typeof Chip> = {
  component: Chip,
  title: "Data Display/Chip",
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "primary",
        "destructive",
        "success",
        "warning",
        "info",
        "outline",
        "ghost",
      ],
      description: "Visual style variant of the chip",
    },
    size: {
      control: "select",
      options: ["sm", "default", "lg"],
      description: "Size of the chip",
    },
    removable: {
      control: "boolean",
      description: "Shows remove button (X)",
    },
    children: {
      control: "text",
      description: "Chip text content",
    },
  },
};

export default meta;
type Story = StoryObj<typeof Chip>;

// Basic variants
export const Default: Story = {
  args: {
    children: "Default",
  },
};

export const Primary: Story = {
  args: {
    children: "Primary",
    variant: "primary",
  },
};

export const Destructive: Story = {
  args: {
    children: "Destructive",
    variant: "destructive",
  },
};

export const Success: Story = {
  args: {
    children: "Success",
    variant: "success",
  },
};

export const Warning: Story = {
  args: {
    children: "Warning",
    variant: "warning",
  },
};

export const Info: Story = {
  args: {
    children: "Info",
    variant: "info",
  },
};

export const Outline: Story = {
  args: {
    children: "Outline",
    variant: "outline",
  },
};

export const Ghost: Story = {
  args: {
    children: "Ghost",
    variant: "ghost",
  },
};

// Sizes
export const Small: Story = {
  args: {
    children: "Small chip",
    size: "sm",
  },
};

export const Large: Story = {
  args: {
    children: "Large chip",
    size: "lg",
  },
};

// Removable chips
export const Removable: Story = {
  args: {
    children: "Removable",
    removable: true,
    onRemove: () => alert("Chip removed!"),
  },
};

export const RemovablePrimary: Story = {
  args: {
    children: "Primary",
    variant: "primary",
    removable: true,
    onRemove: () => alert("Chip removed!"),
  },
};

export const RemovableSuccess: Story = {
  args: {
    children: "Success",
    variant: "success",
    removable: true,
    onRemove: () => alert("Chip removed!"),
  },
};

// Icon examples
const TagIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

const UserIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const CheckIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const AlertIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export const WithIcon: Story = {
  args: {
    children: "Tagged",
    prefix: <TagIcon />,
  },
};

export const WithIconRemovable: Story = {
  args: {
    children: "User",
    prefix: <UserIcon />,
    variant: "primary",
    removable: true,
    onRemove: () => alert("Chip removed!"),
  },
};

// All variants showcase
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Chip variant="default">Default</Chip>
      <Chip variant="primary">Primary</Chip>
      <Chip variant="destructive">Destructive</Chip>
      <Chip variant="success">Success</Chip>
      <Chip variant="warning">Warning</Chip>
      <Chip variant="info">Info</Chip>
      <Chip variant="outline">Outline</Chip>
      <Chip variant="ghost">Ghost</Chip>
    </div>
  ),
};

// All sizes showcase
export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Chip size="sm">Small</Chip>
      <Chip size="default">Default</Chip>
      <Chip size="lg">Large</Chip>
    </div>
  ),
};

// Removable variants showcase
export const AllRemovableVariants: Story = {
  render: () => {
    const [chips, setChips] = useState([
      { id: 1, label: "Default", variant: "default" as const },
      { id: 2, label: "Primary", variant: "primary" as const },
      { id: 3, label: "Destructive", variant: "destructive" as const },
      { id: 4, label: "Success", variant: "success" as const },
      { id: 5, label: "Warning", variant: "warning" as const },
      { id: 6, label: "Info", variant: "info" as const },
    ]);

    return (
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Chip
            key={chip.id}
            variant={chip.variant}
            removable
            onRemove={() =>
              setChips((prev) => prev.filter((c) => c.id !== chip.id))
            }
          >
            {chip.label}
          </Chip>
        ))}
      </div>
    );
  },
};

// Real-world examples
export const CategoryTags: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Chip prefix={<TagIcon />}>Food & Dining</Chip>
      <Chip prefix={<TagIcon />}>Transportation</Chip>
      <Chip prefix={<TagIcon />}>Entertainment</Chip>
      <Chip prefix={<TagIcon />}>Shopping</Chip>
      <Chip prefix={<TagIcon />}>Bills & Utilities</Chip>
    </div>
  ),
};

export const StatusIndicators: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Chip variant="success" prefix={<CheckIcon />}>
        Completed
      </Chip>
      <Chip variant="warning" prefix={<AlertIcon />}>
        Pending
      </Chip>
      <Chip variant="destructive" prefix={<AlertIcon />}>
        Failed
      </Chip>
      <Chip variant="info">In Progress</Chip>
      <Chip variant="outline">Draft</Chip>
    </div>
  ),
};

export const FilterChips: Story = {
  render: () => {
    const [activeFilters, setActiveFilters] = useState([
      "Food & Dining",
      "Last 30 days",
      "Amount > $50",
    ]);

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((filter) => (
            <Chip
              key={filter}
              variant="primary"
              removable
              onRemove={() =>
                setActiveFilters((prev) => prev.filter((f) => f !== filter))
              }
            >
              {filter}
            </Chip>
          ))}
        </div>
        {activeFilters.length === 0 && (
          <p className="text-sm text-muted-foreground">No active filters</p>
        )}
      </div>
    );
  },
};

export const UserTags: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Chip prefix={<UserIcon />} variant="outline" size="sm">
        @john
      </Chip>
      <Chip prefix={<UserIcon />} variant="outline" size="sm">
        @jane
      </Chip>
      <Chip prefix={<UserIcon />} variant="outline" size="sm">
        @alice
      </Chip>
    </div>
  ),
};

export const AccountChips: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Chip variant="info" size="sm">
        ANZ Transaction
      </Chip>
      <Chip variant="success" size="sm">
        Up Everyday
      </Chip>
      <Chip variant="warning" size="sm">
        Amex
      </Chip>
      <Chip variant="primary" size="sm">
        ING Savings
      </Chip>
    </div>
  ),
};

export const SizeComparison: Story = {
  render: () => (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium mb-2">Small</p>
        <div className="flex flex-wrap gap-2">
          <Chip size="sm">Tag</Chip>
          <Chip size="sm" removable onRemove={() => {}}>
            Removable
          </Chip>
          <Chip size="sm" prefix={<TagIcon />}>
            With Icon
          </Chip>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium mb-2">Default</p>
        <div className="flex flex-wrap gap-2">
          <Chip>Tag</Chip>
          <Chip removable onRemove={() => {}}>
            Removable
          </Chip>
          <Chip prefix={<TagIcon />}>With Icon</Chip>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium mb-2">Large</p>
        <div className="flex flex-wrap gap-2">
          <Chip size="lg">Tag</Chip>
          <Chip size="lg" removable onRemove={() => {}}>
            Removable
          </Chip>
          <Chip size="lg" prefix={<TagIcon />}>
            With Icon
          </Chip>
        </div>
      </div>
    </div>
  ),
};

export const LongText: Story = {
  render: () => (
    <div className="max-w-xs space-y-2">
      <Chip>This is a very long chip label that will be truncated</Chip>
      <Chip removable onRemove={() => {}}>
        This is a very long removable chip label
      </Chip>
    </div>
  ),
};

// Interactive playground
export const Playground: Story = {
  args: {
    children: "Playground Chip",
    variant: "default",
    size: "default",
    removable: false,
  },
};
