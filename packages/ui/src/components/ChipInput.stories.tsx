/**
 * ChipInput component stories
 * Demonstrates multi-value input with chips like Gmail's email field
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ChipInput } from "./ChipInput";

const meta: Meta<typeof ChipInput> = {
  component: ChipInput,
  title: "Inputs/Chips",
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "ghost", "underline"],
      description: "Visual style variant",
    },
    shape: {
      control: "select",
      options: ["default", "pill"],
      description: "Shape of the container",
    },
    chipVariant: {
      control: "select",
      options: ["default", "primary", "success"],
      description: "Variant for the chips",
    },
    allowDuplicates: {
      control: "boolean",
      description: "Allow duplicate values",
    },
  },
};

export default meta;
type Story = StoryObj<typeof ChipInput>;

// Basic
export const Default: Story = {
  args: {
    placeholder: "Type and press Enter...",
  },
};

export const WithDefaultValues: Story = {
  args: {
    defaultValue: ["apple", "banana", "orange"],
    placeholder: "Add more fruits...",
  },
};

// Variants
export const Ghost: Story = {
  args: {
    variant: "ghost",
    defaultValue: ["tag1", "tag2"],
    placeholder: "Ghost variant",
  },
};

export const Underline: Story = {
  args: {
    variant: "underline",
    defaultValue: ["tag1", "tag2"],
    placeholder: "Underline variant",
  },
};

export const Pill: Story = {
  args: {
    shape: "pill",
    defaultValue: ["tag1", "tag2"],
    placeholder: "Pill shape",
  },
};

// Chip variants
export const PrimaryChips: Story = {
  args: {
    chipVariant: "primary",
    defaultValue: ["important", "urgent"],
    placeholder: "Primary chips",
  },
};

export const SuccessChips: Story = {
  args: {
    chipVariant: "success",
    defaultValue: ["completed", "approved"],
    placeholder: "Success chips",
  },
};

// Features
export const AllowDuplicates: Story = {
  args: {
    allowDuplicates: true,
    defaultValue: ["tag", "tag", "tag"],
    placeholder: "Duplicates allowed",
  },
};

export const WithValidation: Story = {
  render: (args) => {
    const [values, setValues] = useState<string[]>([]);
    const [error, setError] = useState<string>("");

    const validateEmail = (value: string) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isValid = emailRegex.test(value);
      if (!isValid) {
        setError(`"${value}" is not a valid email`);
        setTimeout(() => setError(""), 3000);
      }
      return isValid;
    };

    return (
      <div className="space-y-2">
        <ChipInput
          {...args}
          value={values}
          onChange={setValues}
          onValidate={validateEmail}
          placeholder="Enter email addresses..."
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  },
};

// Controlled
export const Controlled: Story = {
  render: (args) => {
    const [values, setValues] = useState(["tag1", "tag2"]);
    return (
      <div className="space-y-4">
        <ChipInput
          {...args}
          value={values}
          onChange={setValues}
          placeholder="Add tags..."
        />
        <div className="text-sm text-muted-foreground">
          <p>Current values: {values.join(", ")}</p>
          <button
            onClick={() => setValues([])}
            className="mt-2 text-xs underline"
          >
            Clear all
          </button>
        </div>
      </div>
    );
  },
};

// Real-world examples
export const EmailInput: Story = {
  render: () => {
    const [recipients, setRecipients] = useState<string[]>([]);

    const validateEmail = (value: string) => {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    };

    return (
      <div className="space-y-4 max-w-2xl p-6 border border-border rounded-lg">
        <div className="space-y-2">
          <label className="block text-sm font-medium">To:</label>
          <ChipInput
            value={recipients}
            onChange={setRecipients}
            onValidate={validateEmail}
            placeholder="Enter email addresses..."
            chipVariant="primary"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Subject:</label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-border rounded-md"
            placeholder="Email subject..."
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Message:</label>
          <textarea
            className="w-full px-3 py-2 border border-border rounded-md"
            rows={4}
            placeholder="Type your message..."
          />
        </div>
      </div>
    );
  },
};

export const TagEditor: Story = {
  render: () => {
    const [tags, setTags] = useState(["react", "typescript", "vite"]);

    return (
      <div className="space-y-4 max-w-lg">
        <div>
          <h3 className="text-lg font-semibold mb-2">Post Tags</h3>
          <ChipInput
            value={tags}
            onChange={setTags}
            placeholder="Add tags..."
          />
        </div>
        <div className="text-sm text-muted-foreground">
          <p>Popular tags:</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {["javascript", "css", "html", "nodejs"].map((tag) => (
              <button
                key={tag}
                onClick={() => {
                  if (!tags.includes(tag)) {
                    setTags([...tags, tag]);
                  }
                }}
                className="px-2 py-1 text-xs border border-border rounded hover:bg-accent"
              >
                + {tag}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  },
};

export const CategorySelector: Story = {
  render: () => {
    const [categories, setCategories] = useState<string[]>([
      "Food & Dining",
      "Transportation",
    ]);

    const suggestions = [
      "Food & Dining",
      "Transportation",
      "Entertainment",
      "Shopping",
      "Bills & Utilities",
      "Healthcare",
      "Travel",
      "Education",
    ];

    return (
      <div className="space-y-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium mb-2">
            Transaction Categories
          </label>
          <ChipInput
            value={categories}
            onChange={setCategories}
            placeholder="Add categories..."
            chipVariant="primary"
            allowDuplicates={false}
          />
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-2">Quick add:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions
              .filter((s) => !categories.includes(s))
              .map((category) => (
                <button
                  key={category}
                  onClick={() => setCategories([...categories, category])}
                  className="px-3 py-1 text-sm border border-border rounded-md hover:bg-accent transition-colors"
                >
                  + {category}
                </button>
              ))}
          </div>
        </div>
      </div>
    );
  },
};

export const KeywordInput: Story = {
  render: () => {
    const [keywords, setKeywords] = useState<string[]>([]);

    return (
      <div className="space-y-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium mb-2">
            Search Keywords
          </label>
          <ChipInput
            value={keywords}
            onChange={setKeywords}
            placeholder="Type keywords and press Enter, comma, or Tab..."
            variant="ghost"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          <p>Tips:</p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Press Enter, comma, or Tab to add a keyword</li>
            <li>Press Backspace to remove the last keyword</li>
            <li>Paste multiple keywords separated by commas</li>
          </ul>
        </div>
      </div>
    );
  },
};

// States
export const States: Story = {
  render: () => (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium mb-1">Empty</p>
        <ChipInput placeholder="Type something..." />
      </div>
      <div>
        <p className="text-sm font-medium mb-1">With values</p>
        <ChipInput defaultValue={["tag1", "tag2", "tag3"]} />
      </div>
      <div>
        <p className="text-sm font-medium mb-1">Many values</p>
        <ChipInput
          defaultValue={[
            "apple",
            "banana",
            "orange",
            "grape",
            "kiwi",
            "mango",
            "pear",
            "peach",
          ]}
        />
      </div>
      <div>
        <p className="text-sm font-medium mb-1">Disabled</p>
        <ChipInput defaultValue={["tag1", "tag2"]} disabled />
      </div>
    </div>
  ),
};

// All variants showcase
export const AllVariants: Story = {
  render: () => (
    <div className="space-y-4">
      <ChipInput
        defaultValue={["tag1", "tag2"]}
        placeholder="Default variant"
      />
      <ChipInput
        defaultValue={["tag1", "tag2"]}
        placeholder="Ghost variant"
        variant="ghost"
      />
      <ChipInput
        defaultValue={["tag1", "tag2"]}
        placeholder="Underline variant"
        variant="underline"
      />
    </div>
  ),
};

// Paste example
export const PasteMultipleValues: Story = {
  render: () => {
    const [values, setValues] = useState<string[]>([]);

    return (
      <div className="space-y-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium mb-2">
            Paste Multiple Emails
          </label>
          <ChipInput
            value={values}
            onChange={setValues}
            placeholder="Paste comma or newline separated emails..."
            chipVariant="primary"
          />
        </div>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>Try pasting this:</p>
          <pre className="p-2 bg-muted rounded text-xs">
            john@example.com, jane@example.com{"\n"}alice@example.com
          </pre>
        </div>
      </div>
    );
  },
};

// Interactive playground
export const Playground: Story = {
  args: {
    placeholder: "Type and press Enter...",
    variant: "default",
    shape: "default",
    chipVariant: "default",
    allowDuplicates: false,
  },
};
