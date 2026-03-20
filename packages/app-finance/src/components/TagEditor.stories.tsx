/**
 * TagEditor component stories
 * Demonstrates inline tag editing for transactions
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { TagEditor } from "./TagEditor";

const meta: Meta<typeof TagEditor> = {
  component: TagEditor,
  title: "Inputs/TagEditor",
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "300px", padding: "2rem" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TagEditor>;

// Basic empty state
export const Empty: Story = {
  args: {
    currentTags: [],
    onSave: (tags) => console.log("Saved:", tags),
  },
};

// With existing tags
export const WithTags: Story = {
  args: {
    currentTags: ["Groceries", "Online"],
    onSave: (tags) => console.log("Saved:", tags),
  },
};

// Many tags (overflow display)
export const ManyTags: Story = {
  args: {
    currentTags: ["Groceries", "Online", "Tax Deductible", "Shopping", "Health"],
    onSave: (tags) => console.log("Saved:", tags),
  },
};

// Disabled (read-only display)
export const Disabled: Story = {
  args: {
    currentTags: ["Groceries", "Online"],
    disabled: true,
    onSave: () => undefined,
  },
};

// With AI suggest (mocked with instant response)
export const WithSuggest: Story = {
  args: {
    currentTags: ["Groceries"],
    onSave: (tags) => console.log("Saved:", tags),
    onSuggest: () =>
      new Promise((resolve) => setTimeout(() => resolve(["Online", "Tax Deductible"]), 600)),
  },
};

// Controlled — tracks state changes in the story
export const Controlled: Story = {
  render: (args) => {
    const [saved, setSaved] = useState<string[]>(["Groceries"]);

    return (
      <div className="space-y-4">
        <TagEditor
          {...args}
          currentTags={saved}
          onSave={(tags) => {
            setSaved(tags);
            console.log("Saved:", tags);
          }}
        />
        <div className="text-xs text-muted-foreground">
          Saved tags: {saved.length > 0 ? saved.join(", ") : "none"}
        </div>
      </div>
    );
  },
};

// Simulates save latency
export const WithSaveLatency: Story = {
  args: {
    currentTags: ["Dining"],
    onSave: (tags) =>
      new Promise((resolve) => {
        console.log("Saving:", tags);
        setTimeout(resolve, 1200);
      }),
    onSuggest: () =>
      new Promise((resolve) => setTimeout(() => resolve(["Subscriptions"]), 800)),
  },
};

// Available tags loaded from the database (dynamic Notion Tags)
export const WithAvailableTags: Story = {
  args: {
    currentTags: [],
    onSave: (tags) => console.log("Saved:", tags),
    availableTags: [
      "Groceries",
      "Dining",
      "Transport",
      "Subscriptions",
      "Salary",
      "Freelance",
      "Reimbursement",
      "Cashback",
    ],
  },
};
