/**
 * Button component stories
 * Demonstrates all variants, sizes, shapes, states, and icon support
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  component: Button,
  title: "Actions/Button",
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "destructive",
        "outline",
        "secondary",
        "ghost",
        "link",
      ],
      description: "Visual style variant of the button",
    },
    size: {
      control: "select",
      options: ["sm", "default", "lg", "icon"],
      description: "Size of the button",
    },
    shape: {
      control: "select",
      options: ["default", "pill", "square", "circle"],
      description: "Shape of the button",
    },
    loading: {
      control: "boolean",
      description: "Shows loading spinner and disables the button",
    },
    disabled: {
      control: "boolean",
      description: "Disables the button",
    },
    children: {
      control: "text",
      description: "Button text content",
    },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

// Basic variants
export const Default: Story = {
  args: {
    children: "Button",
    variant: "default",
  },
};

export const Destructive: Story = {
  args: {
    children: "Delete",
    variant: "destructive",
  },
};

export const Outline: Story = {
  args: {
    children: "Outline",
    variant: "outline",
  },
};

export const Secondary: Story = {
  args: {
    children: "Secondary",
    variant: "secondary",
  },
};

export const Ghost: Story = {
  args: {
    children: "Ghost",
    variant: "ghost",
  },
};

export const Link: Story = {
  args: {
    children: "Link",
    variant: "link",
  },
};

// Sizes
export const Small: Story = {
  args: {
    children: "Small Button",
    size: "sm",
  },
};

export const Large: Story = {
  args: {
    children: "Large Button",
    size: "lg",
  },
};

// Shapes
export const Pill: Story = {
  args: {
    children: "Pill Button",
    shape: "pill",
  },
};

export const Square: Story = {
  args: {
    children: "Square",
    shape: "square",
  },
};

// States
export const Disabled: Story = {
  args: {
    children: "Disabled",
    disabled: true,
  },
};

export const Loading: Story = {
  args: {
    children: "Loading",
    loading: true,
  },
};

export const LoadingWithoutText: Story = {
  args: {
    loading: true,
    loadingText: "Processing",
  },
};

// Icon examples
const SaveIcon = () => (
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
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

const ChevronIcon = () => (
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
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const PlusIcon = () => (
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
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
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
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export const WithPrefixIcon: Story = {
  args: {
    children: "Save",
    prefix: <SaveIcon />,
  },
};

export const WithSuffixIcon: Story = {
  args: {
    children: "Next",
    suffix: <ChevronIcon />,
  },
};

export const WithBothIcons: Story = {
  args: {
    children: "Continue",
    prefix: <SaveIcon />,
    suffix: <ChevronIcon />,
  },
};

// Icon-only buttons
export const IconOnly: Story = {
  args: {
    size: "icon",
    "aria-label": "Add item",
    children: <PlusIcon />,
  },
};

export const IconOnlyCircle: Story = {
  args: {
    size: "icon",
    shape: "circle",
    "aria-label": "Add item",
    children: <PlusIcon />,
  },
};

export const IconOnlyOutline: Story = {
  args: {
    size: "icon",
    variant: "outline",
    "aria-label": "Delete item",
    children: <TrashIcon />,
  },
};

export const IconOnlyGhost: Story = {
  args: {
    size: "icon",
    variant: "ghost",
    shape: "circle",
    "aria-label": "Add item",
    children: <PlusIcon />,
  },
};

// Complex examples
export const DestructiveWithIcon: Story = {
  args: {
    children: "Delete Account",
    variant: "destructive",
    prefix: <TrashIcon />,
  },
};

export const LoadingWithIcon: Story = {
  args: {
    children: "Saving",
    loading: true,
    prefix: <SaveIcon />,
  },
};

export const PillWithIcon: Story = {
  args: {
    children: "Add New",
    shape: "pill",
    prefix: <PlusIcon />,
  },
};

// All variants showcase
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button variant="default">Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

// All sizes showcase
export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Icon button">
        <PlusIcon />
      </Button>
    </div>
  ),
};

// All shapes showcase
export const AllShapes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button shape="default">Default</Button>
      <Button shape="pill">Pill</Button>
      <Button shape="square">Square</Button>
      <Button shape="circle" size="icon" aria-label="Circle">
        <PlusIcon />
      </Button>
    </div>
  ),
};

// All states showcase
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4">
        <Button>Default</Button>
        <Button disabled>Disabled</Button>
        <Button loading>Loading</Button>
      </div>
      <div className="flex flex-wrap gap-4">
        <Button variant="outline">Default</Button>
        <Button variant="outline" disabled>
          Disabled
        </Button>
        <Button variant="outline" loading>
          Loading
        </Button>
      </div>
      <div className="flex flex-wrap gap-4">
        <Button variant="destructive">Default</Button>
        <Button variant="destructive" disabled>
          Disabled
        </Button>
        <Button variant="destructive" loading>
          Loading
        </Button>
      </div>
    </div>
  ),
};

// Icon combinations
export const IconCombinations: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <Button prefix={<SaveIcon />}>Prefix</Button>
        <Button suffix={<ChevronIcon />}>Suffix</Button>
        <Button prefix={<SaveIcon />} suffix={<ChevronIcon />}>
          Both
        </Button>
      </div>
      <div className="flex flex-wrap gap-4">
        <Button size="icon" aria-label="Icon only">
          <PlusIcon />
        </Button>
        <Button size="icon" shape="circle" aria-label="Circle icon">
          <PlusIcon />
        </Button>
        <Button size="icon" variant="outline" aria-label="Outline icon">
          <TrashIcon />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Ghost icon">
          <SaveIcon />
        </Button>
      </div>
    </div>
  ),
};

// Real-world examples
export const FormActions: Story = {
  render: () => (
    <div className="flex justify-end gap-3">
      <Button variant="ghost">Cancel</Button>
      <Button>Save Changes</Button>
    </div>
  ),
};

export const CreateActions: Story = {
  render: () => (
    <div className="flex flex-col sm:flex-row gap-3">
      <Button variant="outline" className="flex-1">
        Import from CSV
      </Button>
      <Button prefix={<PlusIcon />} className="flex-1">
        Create New
      </Button>
    </div>
  ),
};

export const DeleteConfirmation: Story = {
  render: () => (
    <div className="flex justify-end gap-3">
      <Button variant="outline">Cancel</Button>
      <Button variant="destructive" prefix={<TrashIcon />}>
        Delete
      </Button>
    </div>
  ),
};

export const LoadingStates: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Button loading>Processing</Button>
      <Button variant="outline" loading>
        Uploading
      </Button>
      <Button variant="destructive" loading>
        Deleting
      </Button>
      <Button size="icon" loading aria-label="Loading">
        <PlusIcon />
      </Button>
    </div>
  ),
};

// Interactive playground (default export allows control panel)
export const Playground: Story = {
  args: {
    children: "Playground Button",
    variant: "default",
    size: "default",
    shape: "default",
    disabled: false,
    loading: false,
  },
};
