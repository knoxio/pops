import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { RadioInput } from "./RadioInput";

const meta: Meta<typeof RadioInput> = {
  title: "Inputs/Radio",
  component: RadioInput,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "400px", padding: "2rem" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const planOptions = [
  {
    label: "Free",
    value: "free",
    description: "Basic features for personal use",
  },
  {
    label: "Pro",
    value: "pro",
    description: "Advanced features for professionals",
  },
  {
    label: "Enterprise",
    value: "enterprise",
    description: "Custom solutions for teams",
  },
];

const paymentOptions = [
  { label: "Credit Card", value: "credit" },
  { label: "PayPal", value: "paypal" },
  { label: "Bank Transfer", value: "bank" },
];

const sizeOptions = [
  { label: "Small", value: "sm" },
  { label: "Medium", value: "md" },
  { label: "Large", value: "lg" },
  { label: "Extra Large", value: "xl" },
];

export const Default: Story = {
  args: {},
  render: () => {
    const [plan, setPlan] = useState("free");
    return (
      <RadioInput
        label="Select a plan"
        options={planOptions}
        value={plan}
        onValueChange={setPlan}
      />
    );
  },
};

export const WithDescription: Story = {
  args: {},
  render: () => {
    const [plan, setPlan] = useState("pro");
    return (
      <RadioInput
        label="Choose your subscription"
        description="Select the plan that best fits your needs"
        options={planOptions}
        value={plan}
        onValueChange={setPlan}
      />
    );
  },
};

export const Required: Story = {
  args: {},
  render: () => {
    const [payment, setPayment] = useState("");
    return (
      <RadioInput
        label="Payment method"
        options={paymentOptions}
        value={payment}
        onValueChange={setPayment}
        required
      />
    );
  },
};

export const WithError: Story = {
  args: {},
  render: () => {
    const [payment, setPayment] = useState("");
    return (
      <RadioInput
        label="Payment method"
        description="Please select how you would like to pay"
        options={paymentOptions}
        value={payment}
        onValueChange={setPayment}
        required
        error
        errorMessage="Please select a payment method to continue"
      />
    );
  },
};

export const Horizontal: Story = {
  args: {},
  render: () => {
    const [size, setSize] = useState("md");
    return (
      <RadioInput
        label="Select size"
        options={sizeOptions}
        value={size}
        onValueChange={setSize}
        orientation="horizontal"
      />
    );
  },
};

export const WithDisabledOption: Story = {
  args: {},
  render: () => {
    const [plan, setPlan] = useState("free");
    return (
      <RadioInput
        label="Select a plan"
        options={[
          { label: "Free", value: "free", description: "Basic features" },
          { label: "Pro", value: "pro", description: "Advanced features" },
          {
            label: "Enterprise",
            value: "enterprise",
            description: "Coming soon",
            disabled: true,
          },
        ]}
        value={plan}
        onValueChange={setPlan}
      />
    );
  },
};

export const Disabled: Story = {
  args: {},
  render: () => {
    return (
      <RadioInput
        label="Select a plan"
        description="This selection is currently disabled"
        options={planOptions}
        value="pro"
        disabled
      />
    );
  },
};

export const DefaultValue: Story = {
  args: {},
  render: () => {
    return (
      <RadioInput
        label="Select a plan"
        description="Pro plan is pre-selected"
        options={planOptions}
        defaultValue="pro"
      />
    );
  },
};

export const SimpleOptions: Story = {
  args: {},
  render: () => {
    const [answer, setAnswer] = useState("");
    return (
      <RadioInput
        label="Do you agree?"
        options={[
          { label: "Yes", value: "yes" },
          { label: "No", value: "no" },
        ]}
        value={answer}
        onValueChange={setAnswer}
        orientation="horizontal"
      />
    );
  },
};
