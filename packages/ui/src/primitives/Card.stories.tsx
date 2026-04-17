import { MoreVerticalIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react';

import { Button } from '../components/Button';
import { Badge } from './badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';
import { Progress } from './progress';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Card> = {
  title: 'Layout/Card',
  component: Card,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <Card className="w-sm">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">Card content area for displaying information.</p>
      </CardContent>
    </Card>
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Card className="w-sm">
      <CardHeader>
        <CardTitle>Confirm Action</CardTitle>
        <CardDescription>This action cannot be undone</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">Are you sure you want to delete this transaction?</p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline" className="flex-1">
          Cancel
        </Button>
        <Button variant="destructive" className="flex-1">
          Delete
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Card className="w-sm">
      <CardHeader>
        <CardTitle>Recent Transactions</CardTitle>
        <CardDescription>Last 7 days</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon" aria-label="More actions">
            <MoreVerticalIcon className="h-4 w-4" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">You have 42 transactions in the last 7 days</p>
      </CardContent>
    </Card>
  ),
};

export const AccountBalance: Story = {
  render: () => (
    <Card className="w-sm">
      <CardHeader>
        <CardTitle>Checking Account</CardTitle>
        <CardDescription>ANZ Everyday Account</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Available Balance</p>
            <p className="text-3xl font-bold">$2,458.32</p>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Account Number</span>
            <span>****1234</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">BSB</span>
            <span>012-345</span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full">View Transactions</Button>
      </CardFooter>
    </Card>
  ),
};

export const BudgetCard: Story = {
  render: () => (
    <Card className="w-sm">
      <CardHeader>
        <CardTitle>Food & Dining</CardTitle>
        <CardDescription>February 2026</CardDescription>
        <CardAction>
          <Badge>75% spent</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between items-baseline">
            <span className="text-2xl font-bold">$450</span>
            <span className="text-sm text-muted-foreground">of $600</span>
          </div>
          <Progress value={75} />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Remaining</span>
            <span className="font-medium">$150</span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full">
          View Details
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const StatCard: Story = {
  render: () => (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Total Income</CardTitle>
          <CardAction>
            <TrendingUpIcon className="h-4 w-4 text-green-600" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">$7,250.00</div>
          <p className="text-xs text-green-600">+12.5% from last month</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
          <CardAction>
            <TrendingDownIcon className="h-4 w-4 text-red-600" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">$4,892.34</div>
          <p className="text-xs text-red-600">+8.2% from last month</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Net Savings</CardTitle>
          <CardAction>
            <TrendingUpIcon className="h-4 w-4 text-green-600" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">$2,357.66</div>
          <p className="text-xs text-muted-foreground">32.5% saved</p>
        </CardContent>
      </Card>
    </div>
  ),
};

export const TransactionCard: Story = {
  render: () => (
    <Card className="w-sm">
      <CardHeader>
        <CardTitle>Woolworths Sydney</CardTitle>
        <CardDescription>Feb 10, 2026 • 3:24 PM</CardDescription>
        <CardAction>
          <Badge variant="default" className="bg-green-600">
            Completed
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Amount</span>
          <span className="text-lg font-bold text-red-600">-$87.45</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Account</span>
          <span>Checking</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Category</span>
          <Badge className="bg-blue-600 text-white">Food</Badge>
        </div>
        <div className="pt-2">
          <p className="text-xs text-muted-foreground">Note</p>
          <p className="text-sm">Weekly grocery shopping</p>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline" className="flex-1">
          Edit
        </Button>
        <Button variant="destructive" className="flex-1">
          Delete
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const SavingsGoalCard: Story = {
  render: () => (
    <Card className="w-sm">
      <CardHeader>
        <CardTitle>Emergency Fund</CardTitle>
        <CardDescription>Goal: $10,000</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="text-3xl font-bold">$6,750</span>
            <span className="text-sm text-muted-foreground">67.5%</span>
          </div>
          <Progress value={67.5} className="h-3" />
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Remaining</p>
            <p className="font-medium">$3,250</p>
          </div>
          <div>
            <p className="text-muted-foreground">Est. Completion</p>
            <p className="font-medium">Apr 2026</p>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full">Add Contribution</Button>
      </CardFooter>
    </Card>
  ),
};

export const NotificationCard: Story = {
  render: () => (
    <Card className="w-sm">
      <CardHeader>
        <CardTitle>Budget Alert</CardTitle>
        <CardDescription>2 hours ago</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon" aria-label="More actions">
            <MoreVerticalIcon className="h-4 w-4" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm">
          You've reached 85% of your Shopping budget for February. Consider reducing spending in
          this category.
        </p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline" className="flex-1">
          Dismiss
        </Button>
        <Button className="flex-1">View Budget</Button>
      </CardFooter>
    </Card>
  ),
};

export const CompactCards: Story = {
  render: () => (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Checking</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">$2,458</div>
          <p className="text-xs text-muted-foreground">ANZ Everyday</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Savings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">$12,847</div>
          <p className="text-xs text-muted-foreground">ANZ Progress Saver</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Credit Card</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">-$1,234</div>
          <p className="text-xs text-muted-foreground">ANZ Low Rate Visa</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Investment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">$45,678</div>
          <p className="text-xs text-muted-foreground">Portfolio Balance</p>
        </CardContent>
      </Card>
    </div>
  ),
};

export const DashboardGrid: Story = {
  render: () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>Your financial summary for February 2026</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-50 flex items-center justify-center text-muted-foreground">
            Chart would go here
          </div>
        </CardContent>
      </Card>

      <Card className="col-span-3">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { desc: 'Woolworths', amount: '-$87.45' },
              { desc: 'Netflix', amount: '-$22.99' },
              { desc: 'Salary', amount: '+$3,500.00' },
            ].map((txn, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{txn.desc}</span>
                <span
                  className={
                    txn.amount.startsWith('+') ? 'text-green-600 font-medium' : 'text-red-600'
                  }
                >
                  {txn.amount}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="ghost" className="w-full">
            View All
          </Button>
        </CardFooter>
      </Card>
    </div>
  ),
};
