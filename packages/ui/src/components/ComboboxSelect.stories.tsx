import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ComboboxSelect } from "./ComboboxSelect";

const meta: Meta<typeof ComboboxSelect> = {
  title: "Inputs/Select",
  component: ComboboxSelect,
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

const countries = [
  { label: "Australia", value: "au" },
  { label: "Brazil", value: "br" },
  { label: "Canada", value: "ca" },
  { label: "China", value: "cn" },
  { label: "France", value: "fr" },
  { label: "Germany", value: "de" },
  { label: "India", value: "in" },
  { label: "Japan", value: "jp" },
  { label: "Mexico", value: "mx" },
  { label: "United Kingdom", value: "gb" },
  { label: "United States", value: "us" },
];

const categories = [
  { label: "Food & Dining", value: "food" },
  { label: "Shopping", value: "shopping" },
  { label: "Transport", value: "transport" },
  { label: "Entertainment", value: "entertainment" },
  { label: "Bills & Utilities", value: "bills" },
  { label: "Healthcare", value: "healthcare" },
  { label: "Education", value: "education" },
  { label: "Travel", value: "travel" },
];

export const SingleSelect: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState<string>("");
    return (
      <ComboboxSelect
        options={countries}
        value={value}
        onChange={(v) => setValue(v as string)}
        placeholder="Select a country..."
      />
    );
  },
};

export const MultiSelect: Story = {
  args: {},
  render: () => {
    const [values, setValues] = useState<string[]>([]);
    return (
      <ComboboxSelect
        options={categories}
        value={values}
        onChange={(v) => setValues(v as string[])}
        multiple
        placeholder="Select categories..."
      />
    );
  },
};

export const MultiSelectWithDefault: Story = {
  args: {},
  render: () => {
    const [values, setValues] = useState<string[]>(["food", "transport"]);
    return (
      <ComboboxSelect
        options={categories}
        value={values}
        onChange={(v) => setValues(v as string[])}
        multiple
        placeholder="Select categories..."
      />
    );
  },
};

export const WithFiltering: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState<string>("");
    return (
      <ComboboxSelect
        options={countries}
        value={value}
        onChange={(v) => setValue(v as string)}
        searchPlaceholder="Type to filter..."
        placeholder="Select country..."
      />
    );
  },
};

export const MultiSelectWithChips: Story = {
  args: {},
  render: () => {
    const [values, setValues] = useState<string[]>([]);
    return (
      <ComboboxSelect
        options={categories}
        value={values}
        onChange={(v) => setValues(v as string[])}
        multiple
        placeholder="Select categories..."
      />
    );
  },
};

export const WithDisabledOptions: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState<string>("");
    const optionsWithDisabled = [
      { label: "Available", value: "1" },
      { label: "Disabled", value: "2", disabled: true },
      { label: "Also Available", value: "3" },
      { label: "Also Disabled", value: "4", disabled: true },
    ];
    return (
      <ComboboxSelect
        options={optionsWithDisabled}
        value={value}
        onChange={(v) => setValue(v as string)}
        placeholder="Select an option..."
      />
    );
  },
};

export const DefaultVariant: Story = {
  args: {},
  render: () => {
    const [values, setValues] = useState<string[]>([]);
    return (
      <ComboboxSelect
        options={categories}
        value={values}
        onChange={(v) => setValues(v as string[])}
        multiple
        variant="default"
        placeholder="Select categories..."
      />
    );
  },
};

export const Disabled: Story = {
  args: {},
  render: () => {
    return (
      <ComboboxSelect
        options={countries}
        value="us"
        disabled
        placeholder="Disabled..."
      />
    );
  },
};
