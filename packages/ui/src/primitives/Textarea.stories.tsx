import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Textarea } from "./textarea";

const meta: Meta<typeof Textarea> = {
  title: "Inputs/Textarea",
  component: Textarea,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: "Enter your text here...",
  },
};

export const WithValue: Story = {
  args: {
    defaultValue: "This is some default text in the textarea.",
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: "This textarea is disabled",
  },
};

export const WithLabel: Story = {
  args: {},
  render: () => (
    <div className="space-y-2 w-96">
      <label className="text-sm font-medium">Description</label>
      <Textarea placeholder="Enter a description..." />
    </div>
  ),
};

export const WithCharacterCount: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState("");
    const maxLength = 280;

    return (
      <div className="space-y-2 w-96">
        <label className="text-sm font-medium">Comment</label>
        <Textarea
          placeholder="What's on your mind?"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={maxLength}
        />
        <p className="text-xs text-muted-foreground text-right">
          {value.length} / {maxLength}
        </p>
      </div>
    );
  },
};

export const WithError: Story = {
  args: {},
  render: () => (
    <div className="space-y-2 w-96">
      <label className="text-sm font-medium">Message</label>
      <Textarea placeholder="Enter your message..." aria-invalid="true" defaultValue="Too short" />
      <p className="text-xs text-destructive">Message must be at least 10 characters</p>
    </div>
  ),
};

export const TransactionNote: Story = {
  args: {},
  render: () => {
    const [note, setNote] = useState("");

    return (
      <div className="space-y-4 w-96 rounded-lg border p-6">
        <div>
          <h3 className="text-sm font-semibold">Transaction Details</h3>
          <p className="text-xs text-muted-foreground">Woolworths Sydney • $87.45</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Add Note</label>
          <Textarea
            placeholder="Add any additional details about this transaction..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
        </div>
      </div>
    );
  },
};

export const BudgetDescription: Story = {
  args: {},
  render: () => {
    const [description, setDescription] = useState("");

    return (
      <div className="space-y-6 w-96">
        <div className="space-y-2">
          <label className="text-sm font-medium">Budget Name</label>
          <input
            type="text"
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="e.g., Holiday Fund"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Description</label>
          <Textarea
            placeholder="Describe the purpose and goals of this budget..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            Help yourself remember why you created this budget
          </p>
        </div>
      </div>
    );
  },
};

export const Feedback: Story = {
  args: {},
  render: () => {
    const [feedback, setFeedback] = useState("");
    const minLength = 20;
    const isValid = feedback.length >= minLength;

    return (
      <div className="space-y-4 w-96 rounded-lg border p-6">
        <div>
          <h3 className="text-lg font-semibold">Send Feedback</h3>
          <p className="text-sm text-muted-foreground">We'd love to hear your thoughts</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Your Feedback</label>
          <Textarea
            placeholder="Tell us what you think..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            aria-invalid={feedback.length > 0 && !isValid ? "true" : undefined}
            rows={5}
          />
          {feedback.length > 0 && !isValid && (
            <p className="text-xs text-destructive">
              Please provide at least {minLength} characters
            </p>
          )}
          {isValid && <p className="text-xs text-green-600">Looks good!</p>}
        </div>

        <button
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          disabled={!isValid}
        >
          Submit Feedback
        </button>
      </div>
    );
  },
};

export const AutoGrowing: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState("");

    return (
      <div className="space-y-2 w-96">
        <label className="text-sm font-medium">Notes (Auto-growing)</label>
        <Textarea
          placeholder="Start typing... This textarea grows automatically"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={2}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground">Uses field-sizing: content (CSS feature)</p>
      </div>
    );
  },
};

export const FixedSize: Story = {
  args: {},
  render: () => (
    <div className="space-y-6">
      <div className="space-y-2 w-96">
        <p className="text-sm font-medium">Small (rows=2)</p>
        <Textarea placeholder="Small textarea..." rows={2} />
      </div>

      <div className="space-y-2 w-96">
        <p className="text-sm font-medium">Medium (rows=4)</p>
        <Textarea placeholder="Medium textarea..." rows={4} />
      </div>

      <div className="space-y-2 w-96">
        <p className="text-sm font-medium">Large (rows=8)</p>
        <Textarea placeholder="Large textarea..." rows={8} />
      </div>
    </div>
  ),
};

export const Form: Story = {
  args: {},
  render: () => {
    const [formData, setFormData] = useState({
      title: "",
      description: "",
      notes: "",
    });

    return (
      <div className="space-y-6 w-96 rounded-lg border p-6">
        <h3 className="text-lg font-semibold">Create Budget Goal</h3>

        <div className="space-y-2">
          <label className="text-sm font-medium">Goal Title</label>
          <input
            type="text"
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="e.g., Emergency Fund"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Description</label>
          <Textarea
            placeholder="What is this goal for?"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Additional Notes</label>
          <Textarea
            placeholder="Any other details... (optional)"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={2}
          />
        </div>

        <div className="flex gap-2">
          <button className="flex-1 rounded-md border px-4 py-2 text-sm font-medium">Cancel</button>
          <button className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Create Goal
          </button>
        </div>
      </div>
    );
  },
};

export const ResizableVariants: Story = {
  args: {},
  render: () => (
    <div className="space-y-6">
      <div className="space-y-2 w-96">
        <p className="text-sm font-medium">Not Resizable</p>
        <Textarea placeholder="Cannot be resized..." className="resize-none" />
      </div>

      <div className="space-y-2 w-96">
        <p className="text-sm font-medium">Vertical Resize Only</p>
        <Textarea placeholder="Can resize vertically..." className="resize-y" />
      </div>

      <div className="space-y-2 w-96">
        <p className="text-sm font-medium">Both Directions (Default)</p>
        <Textarea placeholder="Can resize in any direction..." />
      </div>
    </div>
  ),
};
