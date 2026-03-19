import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Autocomplete } from "./Autocomplete";

const meta: Meta<typeof Autocomplete> = {
  title: "Inputs/Autocomplete",
  component: Autocomplete,
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

const cities = [
  { label: "Sydney", value: "syd", description: "New South Wales, Australia" },
  { label: "Melbourne", value: "mel", description: "Victoria, Australia" },
  { label: "Brisbane", value: "bne", description: "Queensland, Australia" },
  { label: "Perth", value: "per", description: "Western Australia" },
  { label: "Adelaide", value: "adl", description: "South Australia" },
  {
    label: "Canberra",
    value: "can",
    description: "Australian Capital Territory",
  },
  { label: "Hobart", value: "hba", description: "Tasmania, Australia" },
  {
    label: "Darwin",
    value: "drw",
    description: "Northern Territory, Australia",
  },
  { label: "Gold Coast", value: "ool", description: "Queensland, Australia" },
  {
    label: "Newcastle",
    value: "ntl",
    description: "New South Wales, Australia",
  },
];

const merchants = [
  { label: "Woolworths", value: "ww" },
  { label: "Coles", value: "coles" },
  { label: "Aldi", value: "aldi" },
  { label: "IGA", value: "iga" },
  { label: "Target", value: "target" },
  { label: "Kmart", value: "kmart" },
  { label: "Bunnings", value: "bunnings" },
  { label: "JB Hi-Fi", value: "jbhifi" },
  { label: "The Good Guys", value: "goodguys" },
  { label: "Harvey Norman", value: "harvey" },
];

export const Default: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState("");
    return (
      <Autocomplete
        suggestions={cities}
        value={value}
        onChange={setValue}
        onSelect={(item) => console.log("Selected:", item)}
        placeholder="Search cities..."
      />
    );
  },
};

export const WithDescriptions: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState("");
    return (
      <Autocomplete
        suggestions={cities}
        value={value}
        onChange={setValue}
        onSelect={(item) => setValue(item.label)}
        placeholder="Type to search cities..."
      />
    );
  },
};

export const WithIcons: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState("");
    return (
      <Autocomplete
        suggestions={merchants}
        value={value}
        onChange={setValue}
        onSelect={(item) => setValue(item.label)}
        placeholder="Search merchants..."
      />
    );
  },
};

export const Clearable: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState("");
    return (
      <Autocomplete
        suggestions={cities}
        value={value}
        onChange={setValue}
        onSelect={(item) => setValue(item.label)}
        placeholder="Search cities..."
      />
    );
  },
};

export const WithDescriptionsExample: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState("");
    return (
      <Autocomplete
        suggestions={cities}
        value={value}
        onChange={setValue}
        onSelect={(item) => setValue(item.label)}
        placeholder="Type to search..."
      />
    );
  },
};

export const CustomEmpty: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState("");
    return (
      <Autocomplete
        suggestions={merchants}
        value={value}
        onChange={setValue}
        onSelect={(item) => setValue(item.label)}
        emptyMessage="No merchants found."
        placeholder="Search merchants..."
      />
    );
  },
};

export const Disabled: Story = {
  args: {},
  render: () => {
    return (
      <Autocomplete
        suggestions={cities}
        value="Sydney"
        disabled
        placeholder="Disabled..."
      />
    );
  },
};
