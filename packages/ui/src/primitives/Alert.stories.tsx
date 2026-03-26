import type { Meta, StoryObj } from "@storybook/react-vite";
import { Alert, AlertDescription, AlertTitle } from "./alert";
import { InfoIcon, TriangleAlertIcon, OctagonXIcon, CircleCheckIcon } from "lucide-react";

const meta: Meta<typeof Alert> = {
  title: "Feedback/Alert",
  component: Alert,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
  render: () => (
    <Alert>
      <InfoIcon />
      <AlertTitle>Information</AlertTitle>
      <AlertDescription>
        You have new transactions to review in your checking account.
      </AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  args: {},
  render: () => (
    <Alert variant="destructive">
      <OctagonXIcon />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>
        Failed to sync transactions. Please check your connection and try again.
      </AlertDescription>
    </Alert>
  ),
};

export const Success: Story = {
  args: {},
  render: () => (
    <Alert className="border-green-500 text-green-700 dark:text-green-400">
      <CircleCheckIcon />
      <AlertTitle>Success</AlertTitle>
      <AlertDescription>All transactions have been successfully imported.</AlertDescription>
    </Alert>
  ),
};

export const Warning: Story = {
  args: {},
  render: () => (
    <Alert className="border-yellow-500 text-yellow-700 dark:text-yellow-400">
      <TriangleAlertIcon />
      <AlertTitle>Warning</AlertTitle>
      <AlertDescription>
        Your budget for groceries is 85% spent. Consider reducing spending in this category.
      </AlertDescription>
    </Alert>
  ),
};

export const WithoutIcon: Story = {
  args: {},
  render: () => (
    <Alert>
      <AlertTitle>System Maintenance</AlertTitle>
      <AlertDescription>
        Scheduled maintenance will occur on Saturday, March 15th from 2:00 AM to 4:00 AM EST.
      </AlertDescription>
    </Alert>
  ),
};

export const TitleOnly: Story = {
  args: {},
  render: () => (
    <Alert variant="destructive">
      <OctagonXIcon />
      <AlertTitle>Connection lost</AlertTitle>
    </Alert>
  ),
};

export const DescriptionOnly: Story = {
  args: {},
  render: () => (
    <Alert>
      <InfoIcon />
      <AlertDescription>
        You can now categorize transactions using AI-powered suggestions.
      </AlertDescription>
    </Alert>
  ),
};

export const MultipleAlerts: Story = {
  args: {},
  render: () => (
    <div className="space-y-4">
      <Alert>
        <InfoIcon />
        <AlertTitle>New Feature</AlertTitle>
        <AlertDescription>Check out the new transaction filters in the sidebar.</AlertDescription>
      </Alert>
      <Alert className="border-yellow-500 text-yellow-700 dark:text-yellow-400">
        <TriangleAlertIcon />
        <AlertTitle>Budget Alert</AlertTitle>
        <AlertDescription>You're approaching your monthly spending limit.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <OctagonXIcon />
        <AlertTitle>Sync Error</AlertTitle>
        <AlertDescription>Unable to connect to API. Retrying in 5 minutes.</AlertDescription>
      </Alert>
    </div>
  ),
};

export const LongContent: Story = {
  args: {},
  render: () => (
    <Alert>
      <InfoIcon />
      <AlertTitle>Import Complete</AlertTitle>
      <AlertDescription>
        Successfully imported 1,247 transactions from ANZ, Amex, and ING. All transactions have been
        matched with existing entities using the 5-stage matching pipeline. Entity matching achieved
        a 98% success rate with manual aliases, exact matches, and prefix matching. The remaining 2%
        were matched using AI-powered entity recognition with cached results for future imports.
      </AlertDescription>
    </Alert>
  ),
};
