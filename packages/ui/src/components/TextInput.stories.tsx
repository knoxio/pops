/**
 * TextInput component stories
 * Demonstrates all variants, sizes, shapes, and features
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { TextInput } from "./TextInput";

const meta: Meta<typeof TextInput> = {
  component: TextInput,
  title: "Inputs/Text",
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "ghost", "underline"],
      description: "Visual style variant",
    },
    size: {
      control: "select",
      options: ["sm", "default", "lg"],
      description: "Size of the input",
    },
    shape: {
      control: "select",
      options: ["default", "pill"],
      description: "Shape of the input",
    },
    clearable: {
      control: "boolean",
      description: "Shows clear button when input has value",
    },
    disabled: {
      control: "boolean",
      description: "Disables the input",
    },
    placeholder: {
      control: "text",
      description: "Placeholder text",
    },
  },
};

export default meta;
type Story = StoryObj<typeof TextInput>;

// Basic variants
export const Default: Story = {
  args: {
    placeholder: "Enter text...",
  },
};

export const Ghost: Story = {
  args: {
    placeholder: "Ghost variant",
    variant: "ghost",
  },
};

export const Underline: Story = {
  args: {
    placeholder: "Underline variant",
    variant: "underline",
  },
};

// Shapes
export const Pill: Story = {
  args: {
    placeholder: "Pill shape",
    shape: "pill",
  },
};

export const PillGhost: Story = {
  args: {
    placeholder: "Pill ghost",
    variant: "ghost",
    shape: "pill",
  },
};

// Sizes
export const Small: Story = {
  args: {
    placeholder: "Small input",
    size: "sm",
  },
};

export const Large: Story = {
  args: {
    placeholder: "Large input",
    size: "lg",
  },
};

// Clearable
export const Clearable: Story = {
  args: {
    placeholder: "Type something...",
    clearable: true,
    defaultValue: "Clear me!",
  },
};

export const ClearableControlled: Story = {
  render: (args) => {
    const [value, setValue] = useState("Clear me!");
    return (
      <TextInput
        {...args}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onClear={() => setValue("")}
        clearable
        placeholder="Type something..."
      />
    );
  },
};

// Icons
const SearchIcon = () => (
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
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

const MailIcon = () => (
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
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const DollarIcon = () => (
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
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const CalendarIcon = () => (
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
    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

export const WithPrefixIcon: Story = {
  args: {
    placeholder: "Search...",
    prefix: <SearchIcon />,
  },
};

export const WithSuffixIcon: Story = {
  args: {
    placeholder: "Select date",
    suffix: <CalendarIcon />,
  },
};

export const WithPrefixAndClearable: Story = {
  args: {
    placeholder: "Search...",
    prefix: <SearchIcon />,
    clearable: true,
    defaultValue: "Search query",
  },
};

// All variants showcase
export const AllVariants: Story = {
  render: () => (
    <div className="space-y-4">
      <TextInput placeholder="Default variant" />
      <TextInput placeholder="Ghost variant" variant="ghost" />
      <TextInput placeholder="Underline variant" variant="underline" />
    </div>
  ),
};

// All sizes showcase
export const AllSizes: Story = {
  render: () => (
    <div className="space-y-4">
      <TextInput placeholder="Small" size="sm" />
      <TextInput placeholder="Default" size="default" />
      <TextInput placeholder="Large" size="lg" />
    </div>
  ),
};

// All shapes showcase
export const AllShapes: Story = {
  render: () => (
    <div className="space-y-4">
      <TextInput placeholder="Default shape" shape="default" />
      <TextInput placeholder="Pill shape" shape="pill" />
    </div>
  ),
};

// Real-world examples
export const SearchBar: Story = {
  render: () => (
    <TextInput
      placeholder="Search transactions..."
      prefix={<SearchIcon />}
      clearable
      shape="pill"
    />
  ),
};

export const EmailInput: Story = {
  render: () => (
    <TextInput
      type="email"
      placeholder="Enter your email"
      prefix={<MailIcon />}
      clearable
    />
  ),
};

export const AmountInput: Story = {
  render: () => (
    <TextInput type="number" placeholder="0.00" prefix={<DollarIcon />} />
  ),
};

export const DatePicker: Story = {
  render: () => <TextInput type="date" suffix={<CalendarIcon />} />,
};

export const FormFields: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <div>
        <label className="block text-sm font-medium mb-1">Email</label>
        <TextInput
          type="email"
          placeholder="you@example.com"
          prefix={<MailIcon />}
          clearable
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Search</label>
        <TextInput
          placeholder="Search..."
          prefix={<SearchIcon />}
          variant="ghost"
          clearable
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Amount</label>
        <TextInput type="number" placeholder="0.00" prefix={<DollarIcon />} />
      </div>
    </div>
  ),
};

export const FilterBar: Story = {
  render: () => {
    const [search, setSearch] = useState("");
    return (
      <div className="flex gap-3">
        <TextInput
          placeholder="Search transactions..."
          prefix={<SearchIcon />}
          clearable
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch("")}
          className="flex-1"
        />
        <TextInput type="date" placeholder="Start date" />
        <TextInput type="date" placeholder="End date" />
      </div>
    );
  },
};

export const States: Story = {
  render: () => (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium mb-1">Default</p>
        <TextInput placeholder="Type something..." />
      </div>
      <div>
        <p className="text-sm font-medium mb-1">With value</p>
        <TextInput defaultValue="Has a value" />
      </div>
      <div>
        <p className="text-sm font-medium mb-1">Clearable with value</p>
        <TextInput defaultValue="Clear me!" clearable />
      </div>
      <div>
        <p className="text-sm font-medium mb-1">Disabled</p>
        <TextInput placeholder="Disabled input" disabled />
      </div>
      <div>
        <p className="text-sm font-medium mb-1">Disabled with value</p>
        <TextInput defaultValue="Disabled with value" disabled />
      </div>
    </div>
  ),
};

export const VariantComparison: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium mb-2">Default</p>
        <div className="space-y-2">
          <TextInput placeholder="No icons" />
          <TextInput placeholder="With prefix" prefix={<SearchIcon />} />
          <TextInput placeholder="Clearable" clearable defaultValue="Text" />
          <TextInput
            placeholder="Prefix + clearable"
            prefix={<SearchIcon />}
            clearable
            defaultValue="Search"
          />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium mb-2">Ghost</p>
        <div className="space-y-2">
          <TextInput placeholder="No icons" variant="ghost" />
          <TextInput
            placeholder="With prefix"
            prefix={<SearchIcon />}
            variant="ghost"
          />
          <TextInput
            placeholder="Clearable"
            clearable
            defaultValue="Text"
            variant="ghost"
          />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium mb-2">Underline</p>
        <div className="space-y-2">
          <TextInput placeholder="No icons" variant="underline" />
          <TextInput
            placeholder="With prefix"
            prefix={<SearchIcon />}
            variant="underline"
          />
          <TextInput
            placeholder="Clearable"
            clearable
            defaultValue="Text"
            variant="underline"
          />
        </div>
      </div>
    </div>
  ),
};

// Interactive playground
export const Playground: Story = {
  args: {
    placeholder: "Playground input",
    variant: "default",
    size: "default",
    shape: "default",
    clearable: false,
    disabled: false,
  },
};
