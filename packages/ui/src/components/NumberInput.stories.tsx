/**
 * NumberInput component stories
 * Demonstrates stepper controls, drag functionality, and all variants
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { NumberInput } from "./NumberInput";

const meta: Meta<typeof NumberInput> = {
  component: NumberInput,
  title: "Inputs/Number",
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
    showSteppers: {
      control: "boolean",
      description: "Show up/down arrow buttons",
    },
    enableDrag: {
      control: "boolean",
      description: "Enable drag to change value",
    },
    min: {
      control: "number",
      description: "Minimum value",
    },
    max: {
      control: "number",
      description: "Maximum value",
    },
    step: {
      control: "number",
      description: "Step for increment/decrement",
    },
  },
};

export default meta;
type Story = StoryObj<typeof NumberInput>;

// Basic
export const Default: Story = {
  args: {
    defaultValue: 0,
  },
};

export const WithMinMax: Story = {
  args: {
    defaultValue: 5,
    min: 0,
    max: 10,
  },
};

export const WithStep: Story = {
  args: {
    defaultValue: 0,
    step: 5,
  },
};

export const NoSteppers: Story = {
  args: {
    defaultValue: 50,
    showSteppers: false,
  },
};

export const NoDrag: Story = {
  args: {
    defaultValue: 50,
    enableDrag: false,
  },
};

// Variants
export const Ghost: Story = {
  args: {
    defaultValue: 10,
    variant: "ghost",
  },
};

export const Underline: Story = {
  args: {
    defaultValue: 10,
    variant: "underline",
  },
};

export const Pill: Story = {
  args: {
    defaultValue: 10,
    shape: "pill",
  },
};

// Sizes
export const Small: Story = {
  args: {
    defaultValue: 5,
    size: "sm",
  },
};

export const Large: Story = {
  args: {
    defaultValue: 5,
    size: "lg",
  },
};

// With prefix/suffix
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

const PercentIcon = () => (
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
    <line x1="19" y1="5" x2="5" y2="19" />
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </svg>
);

export const WithPrefix: Story = {
  args: {
    defaultValue: 100,
    prefix: <DollarIcon />,
  },
};

export const WithSuffix: Story = {
  args: {
    defaultValue: 50,
    suffix: <PercentIcon />,
    min: 0,
    max: 100,
  },
};

// Controlled
export const Controlled: Story = {
  render: (args) => {
    const [value, setValue] = useState(25);
    return (
      <div className="space-y-4">
        <NumberInput
          {...args}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
        />
        <p className="text-sm text-muted-foreground">Current value: {value}</p>
      </div>
    );
  },
  args: {
    min: 0,
    max: 100,
    step: 5,
  },
};

// Real-world examples
export const PriceInput: Story = {
  render: () => (
    <div className="space-y-2 max-w-xs">
      <label className="block text-sm font-medium">Price</label>
      <NumberInput
        prefix={<DollarIcon />}
        defaultValue={0}
        min={0}
        step={0.01}
        placeholder="0.00"
      />
    </div>
  ),
};

export const QuantitySelector: Story = {
  render: () => (
    <div className="space-y-2 max-w-xs">
      <label className="block text-sm font-medium">Quantity</label>
      <NumberInput defaultValue={1} min={1} max={99} step={1} />
    </div>
  ),
};

export const PercentageInput: Story = {
  render: () => (
    <div className="space-y-2 max-w-xs">
      <label className="block text-sm font-medium">Discount</label>
      <NumberInput
        suffix={<PercentIcon />}
        defaultValue={0}
        min={0}
        max={100}
        step={5}
      />
    </div>
  ),
};

export const AgeInput: Story = {
  render: () => (
    <div className="space-y-2 max-w-xs">
      <label className="block text-sm font-medium">Age</label>
      <NumberInput defaultValue={18} min={0} max={120} step={1} />
    </div>
  ),
};

// All variants showcase
export const AllVariants: Story = {
  render: () => (
    <div className="space-y-4">
      <NumberInput placeholder="Default" defaultValue={10} />
      <NumberInput placeholder="Ghost" variant="ghost" defaultValue={10} />
      <NumberInput
        placeholder="Underline"
        variant="underline"
        defaultValue={10}
      />
    </div>
  ),
};

// All sizes showcase
export const AllSizes: Story = {
  render: () => (
    <div className="space-y-4">
      <NumberInput size="sm" defaultValue={5} />
      <NumberInput size="default" defaultValue={5} />
      <NumberInput size="lg" defaultValue={5} />
    </div>
  ),
};

// States
export const States: Story = {
  render: () => (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium mb-1">Default</p>
        <NumberInput defaultValue={10} />
      </div>
      <div>
        <p className="text-sm font-medium mb-1">Disabled</p>
        <NumberInput defaultValue={10} disabled />
      </div>
      <div>
        <p className="text-sm font-medium mb-1">Min/Max limits</p>
        <NumberInput defaultValue={10} min={5} max={15} />
      </div>
      <div>
        <p className="text-sm font-medium mb-1">At minimum</p>
        <NumberInput defaultValue={0} min={0} max={100} />
      </div>
      <div>
        <p className="text-sm font-medium mb-1">At maximum</p>
        <NumberInput defaultValue={100} min={0} max={100} />
      </div>
    </div>
  ),
};

// Features showcase
export const FeaturesShowcase: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium mb-2">With steppers (click arrows)</p>
        <NumberInput defaultValue={50} showSteppers />
      </div>
      <div>
        <p className="text-sm font-medium mb-2">
          Drag to change (hover and drag)
        </p>
        <NumberInput defaultValue={50} enableDrag />
      </div>
      <div>
        <p className="text-sm font-medium mb-2">No steppers</p>
        <NumberInput defaultValue={50} showSteppers={false} />
      </div>
      <div>
        <p className="text-sm font-medium mb-2">No drag</p>
        <NumberInput defaultValue={50} enableDrag={false} />
      </div>
      <div>
        <p className="text-sm font-medium mb-2">Custom step size</p>
        <NumberInput defaultValue={0} step={10} min={0} max={100} />
      </div>
    </div>
  ),
};

// Form example
export const FormExample: Story = {
  render: () => {
    const [price, setPrice] = useState(99.99);
    const [quantity, setQuantity] = useState(1);
    const [discount, setDiscount] = useState(0);

    const total = price * quantity * (1 - discount / 100);

    return (
      <div className="space-y-4 max-w-md p-6 border border-border rounded-lg">
        <h3 className="text-lg font-semibold">Order Form</h3>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Price</label>
          <NumberInput
            prefix={<DollarIcon />}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            min={0}
            step={0.01}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Quantity</label>
          <NumberInput
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            min={1}
            max={999}
            step={1}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Discount</label>
          <NumberInput
            suffix={<PercentIcon />}
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value))}
            min={0}
            max={100}
            step={5}
          />
        </div>

        <div className="pt-4 border-t border-border">
          <div className="flex justify-between text-lg font-semibold">
            <span>Total:</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    );
  },
};

// Interactive playground
export const Playground: Story = {
  args: {
    defaultValue: 50,
    min: 0,
    max: 100,
    step: 1,
    showSteppers: true,
    enableDrag: true,
    variant: "default",
    size: "default",
    shape: "default",
  },
};
