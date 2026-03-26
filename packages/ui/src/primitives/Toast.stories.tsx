import type { Meta, StoryObj } from "@storybook/react-vite";
import { toast } from "sonner";
import { Button } from "../components/Button";
import { Toaster } from "./sonner";

const meta: Meta = {
  title: "Feedback/Toast",
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <>
        <Story />
        <Toaster />
      </>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  args: {},
  render: () => (
    <Button
      onClick={() =>
        toast.success("Transaction saved", {
          description: "Your transaction has been successfully saved.",
        })
      }
    >
      Show Success Toast
    </Button>
  ),
};

export const Error: Story = {
  args: {},
  render: () => (
    <Button
      variant="destructive"
      onClick={() =>
        toast.error("Failed to save", {
          description: "An error occurred while saving the transaction.",
        })
      }
    >
      Show Error Toast
    </Button>
  ),
};

export const Warning: Story = {
  args: {},
  render: () => (
    <Button
      variant="outline"
      onClick={() =>
        toast.warning("Unsaved changes", {
          description: "You have unsaved changes that will be lost.",
        })
      }
    >
      Show Warning Toast
    </Button>
  ),
};

export const Info: Story = {
  args: {},
  render: () => (
    <Button
      variant="secondary"
      onClick={() =>
        toast.info("New feature available", {
          description: "Check out the new transaction filters.",
        })
      }
    >
      Show Info Toast
    </Button>
  ),
};

export const Loading: Story = {
  args: {},
  render: () => (
    <Button
      onClick={() => {
        toast.loading("Syncing transactions...", {
          description: "Please wait while we sync your data.",
        });
      }}
    >
      Show Loading Toast
    </Button>
  ),
};

export const PromiseToast: Story = {
  args: {},
  render: () => (
    <Button
      onClick={() => {
        const promise = new Promise<void>((resolve) => setTimeout(resolve, 2000));

        toast.promise(promise, {
          loading: "Saving transaction...",
          success: "Transaction saved successfully",
          error: "Failed to save transaction",
        });
      }}
    >
      Show Promise Toast
    </Button>
  ),
};

export const WithAction: Story = {
  args: {},
  render: () => (
    <Button
      onClick={() =>
        toast.success("Transaction deleted", {
          description: "The transaction has been removed.",
          action: {
            label: "Undo",
            onClick: () => toast.info("Transaction restored"),
          },
        })
      }
    >
      Show Toast with Action
    </Button>
  ),
};

export const CustomDuration: Story = {
  args: {},
  render: () => (
    <div className="flex gap-2">
      <Button
        variant="outline"
        onClick={() =>
          toast.success("Quick message", {
            duration: 1000,
          })
        }
      >
        1 second
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.success("Standard message", {
            duration: 4000,
          })
        }
      >
        4 seconds
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.success("Long message", {
            duration: 10000,
          })
        }
      >
        10 seconds
      </Button>
    </div>
  ),
};

export const Multiple: Story = {
  args: {},
  render: () => (
    <Button
      onClick={() => {
        toast.success("First notification");
        setTimeout(() => toast.info("Second notification"), 300);
        setTimeout(() => toast.warning("Third notification"), 600);
      }}
    >
      Show Multiple Toasts
    </Button>
  ),
};
