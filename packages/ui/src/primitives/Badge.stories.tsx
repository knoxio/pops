import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  XIcon,
} from 'lucide-react';

import { Badge } from './badge';

const meta: Meta<typeof Badge> = {
  title: 'Data Display/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Badge',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary',
  },
};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Destructive',
  },
};

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: 'Outline',
  },
};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: 'Ghost',
  },
};

export const TransactionStatus: Story = {
  args: {},
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default" className="bg-green-600">
        <CheckIcon />
        Completed
      </Badge>
      <Badge variant="secondary">
        <ClockIcon />
        Pending
      </Badge>
      <Badge variant="destructive">
        <XIcon />
        Failed
      </Badge>
      <Badge variant="outline" className="border-yellow-500 text-yellow-700">
        <AlertTriangleIcon />
        Review
      </Badge>
    </div>
  ),
};

export const WithIcons: Story = {
  args: {},
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">
        <CheckIcon />
        Success
      </Badge>
      <Badge variant="secondary">
        <ClockIcon />
        Waiting
      </Badge>
      <Badge variant="destructive">
        <XIcon />
        Error
      </Badge>
      <Badge variant="outline">
        <AlertTriangleIcon />
        Warning
      </Badge>
    </div>
  ),
};

export const AccountTypes: Story = {
  args: {},
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">Checking</Badge>
      <Badge variant="secondary">Savings</Badge>
      <Badge variant="outline">Credit Card</Badge>
      <Badge className="bg-purple-600 text-white">Investment</Badge>
    </div>
  ),
};

export const Categories: Story = {
  args: {},
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge className="bg-blue-600 text-white">Food</Badge>
      <Badge className="bg-pink-600 text-white">Shopping</Badge>
      <Badge className="bg-orange-600 text-white">Entertainment</Badge>
      <Badge className="bg-green-600 text-white">Transport</Badge>
      <Badge className="bg-purple-600 text-white">Bills</Badge>
      <Badge className="bg-yellow-600 text-white">Health</Badge>
    </div>
  ),
};

export const BudgetStatus: Story = {
  args: {},
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm">Food Budget:</span>
        <Badge variant="default" className="bg-green-600">
          <TrendingDownIcon />
          Under budget
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm">Shopping Budget:</span>
        <Badge variant="outline" className="border-yellow-500 text-yellow-700">
          <AlertTriangleIcon />
          85% spent
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm">Entertainment Budget:</span>
        <Badge variant="destructive">
          <TrendingUpIcon />
          Over budget
        </Badge>
      </div>
    </div>
  ),
};

export const Sizes: Story = {
  args: {},
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge className="text-2xs px-1.5 py-0">Tiny</Badge>
      <Badge className="text-xs px-2 py-0.5">Small</Badge>
      <Badge className="text-sm px-2.5 py-1">Medium</Badge>
      <Badge className="text-base px-3 py-1.5">Large</Badge>
    </div>
  ),
};

export const Interactive: Story = {
  args: {},
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge asChild variant="outline" className="cursor-pointer">
        <button onClick={() => alert('Badge clicked!')}>Clickable</button>
      </Badge>
      <Badge asChild variant="link">
        <a href="#" onClick={(e) => e.preventDefault()}>
          Link Badge
        </a>
      </Badge>
    </div>
  ),
};

export const InTable: Story = {
  args: {},
  render: () => (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-3 text-left text-sm font-medium">Description</th>
            <th className="p-3 text-left text-sm font-medium">Amount</th>
            <th className="p-3 text-left text-sm font-medium">Status</th>
            <th className="p-3 text-left text-sm font-medium">Category</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="p-3 text-sm">Woolworths Sydney</td>
            <td className="p-3 text-sm">$87.45</td>
            <td className="p-3">
              <Badge variant="default" className="bg-green-600">
                <CheckIcon />
                Completed
              </Badge>
            </td>
            <td className="p-3">
              <Badge className="bg-blue-600 text-white">Food</Badge>
            </td>
          </tr>
          <tr className="border-b">
            <td className="p-3 text-sm">Netflix Subscription</td>
            <td className="p-3 text-sm">$22.99</td>
            <td className="p-3">
              <Badge variant="secondary">
                <ClockIcon />
                Pending
              </Badge>
            </td>
            <td className="p-3">
              <Badge className="bg-orange-600 text-white">Entertainment</Badge>
            </td>
          </tr>
          <tr>
            <td className="p-3 text-sm">Failed Payment</td>
            <td className="p-3 text-sm">$150.00</td>
            <td className="p-3">
              <Badge variant="destructive">
                <XIcon />
                Failed
              </Badge>
            </td>
            <td className="p-3">
              <Badge className="bg-purple-600 text-white">Bills</Badge>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  ),
};
