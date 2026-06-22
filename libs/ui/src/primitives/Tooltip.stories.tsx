import { HelpCircleIcon, InfoIcon } from 'lucide-react';

import { Button } from '../components/Button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Tooltip> = {
  title: 'Feedback/Tooltip',
  component: Tooltip,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {},
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>This is a tooltip</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const WithIcon: Story = {
  args: {},
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="More info">
          <InfoIcon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Additional information about this feature</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const Positions: Story = {
  args: {},
  render: () => (
    <div className="flex items-center gap-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Top</Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Tooltip on top</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Right</Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>Tooltip on right</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Bottom</Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Tooltip on bottom</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Left</Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Tooltip on left</p>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};

export const FormField: Story = {
  args: {},
  render: () => (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium">Account Balance</label>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircleIcon className="h-4 w-4 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent>
          <p>The current balance of your account including pending transactions</p>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};

export const LongText: Story = {
  args: {},
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Entity Matching</Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>
          Entity matching uses a 5-stage pipeline: manual aliases, exact match, prefix match,
          contains match, and punctuation stripping. Achieves 95-100% hit rate with aliases, with AI
          fallback for remaining cases.
        </p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const DelayVariations: Story = {
  args: {},
  render: () => (
    <TooltipProvider>
      <div className="flex items-center gap-4">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Instant</Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>No delay (0ms)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Quick</Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Quick delay (200ms)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider delayDuration={700}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Slow</Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Slower delay (700ms)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </TooltipProvider>
  ),
};

export const InDataTable: Story = {
  args: {},
  render: () => (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-2 text-left text-sm font-medium">
              <div className="flex items-center gap-2">
                Description
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>The merchant or transaction description</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </th>
            <th className="p-2 text-left text-sm font-medium">
              <div className="flex items-center gap-2">
                Amount
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Transaction amount in AUD</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </th>
            <th className="p-2 text-left text-sm font-medium">
              <div className="flex items-center gap-2">
                Category
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Spending category for budgeting</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="p-2 text-sm">Woolworths Sydney</td>
            <td className="p-2 text-sm">$87.45</td>
            <td className="p-2 text-sm">Food</td>
          </tr>
        </tbody>
      </table>
    </div>
  ),
};

export const Multiple: Story = {
  args: {},
  render: () => (
    <div className="flex flex-wrap gap-2">
      {['Food', 'Shopping', 'Entertainment', 'Transport', 'Bills'].map((category) => (
        <Tooltip key={category}>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm">
              {category}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Filter transactions by {category.toLowerCase()} category</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  ),
};
