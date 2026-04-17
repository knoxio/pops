import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
  title: 'Navigation/Tabs',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-100">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <p className="text-sm">Account settings and preferences</p>
      </TabsContent>
      <TabsContent value="password">
        <p className="text-sm">Change your password here</p>
      </TabsContent>
    </Tabs>
  ),
};

export const LineVariant: Story = {
  render: () => (
    <Tabs defaultValue="transactions" className="w-full">
      <TabsList variant="line">
        <TabsTrigger value="transactions">Transactions</TabsTrigger>
        <TabsTrigger value="budget">Budget</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
      </TabsList>
      <TabsContent value="transactions">
        <p className="text-sm py-4">View and manage all your transactions</p>
      </TabsContent>
      <TabsContent value="budget">
        <p className="text-sm py-4">Track spending against your budget</p>
      </TabsContent>
      <TabsContent value="reports">
        <p className="text-sm py-4">Financial reports and analytics</p>
      </TabsContent>
    </Tabs>
  ),
};

export const TransactionsTabs: Story = {
  render: () => (
    <Tabs defaultValue="all" className="w-full">
      <TabsList>
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="income">Income</TabsTrigger>
        <TabsTrigger value="expenses">Expenses</TabsTrigger>
        <TabsTrigger value="transfers">Transfers</TabsTrigger>
      </TabsList>
      <TabsContent value="all" className="space-y-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">All Transactions</p>
          <p className="text-sm text-muted-foreground">1,247 transactions</p>
        </div>
      </TabsContent>
      <TabsContent value="income" className="space-y-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">Income</p>
          <p className="text-sm text-muted-foreground">124 transactions</p>
        </div>
      </TabsContent>
      <TabsContent value="expenses" className="space-y-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">Expenses</p>
          <p className="text-sm text-muted-foreground">1,089 transactions</p>
        </div>
      </TabsContent>
      <TabsContent value="transfers" className="space-y-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">Transfers</p>
          <p className="text-sm text-muted-foreground">34 transactions</p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};

export const AccountsTabs: Story = {
  render: () => (
    <Tabs defaultValue="checking" className="w-full">
      <TabsList>
        <TabsTrigger value="checking">Checking</TabsTrigger>
        <TabsTrigger value="savings">Savings</TabsTrigger>
        <TabsTrigger value="credit">Credit Card</TabsTrigger>
      </TabsList>
      <TabsContent value="checking">
        <Card>
          <CardHeader>
            <CardTitle>Checking Account</CardTitle>
            <CardDescription>ANZ Everyday Account</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Balance</span>
                <span className="text-lg font-bold">$2,458.32</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Available</span>
                <span>$2,458.32</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="savings">
        <Card>
          <CardHeader>
            <CardTitle>Savings Account</CardTitle>
            <CardDescription>ANZ Progress Saver</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Balance</span>
                <span className="text-lg font-bold">$12,847.65</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Interest Rate</span>
                <span>2.50% p.a.</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="credit">
        <Card>
          <CardHeader>
            <CardTitle>Credit Card</CardTitle>
            <CardDescription>ANZ Low Rate Visa</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Balance</span>
                <span className="text-lg font-bold text-red-600">-$1,234.56</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Available Credit</span>
                <span>$8,765.44</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Credit Limit</span>
                <span>$10,000.00</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
};

export const ReportsTabs: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList variant="line">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="spending">Spending</TabsTrigger>
        <TabsTrigger value="income">Income</TabsTrigger>
        <TabsTrigger value="trends">Trends</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="space-y-4 pt-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Total Income</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">$7,250.00</p>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Total Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">$4,892.34</p>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Net Savings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">$2,357.66</p>
              <p className="text-xs text-muted-foreground">32.5% saved</p>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
      <TabsContent value="spending" className="pt-4">
        <p className="text-sm text-muted-foreground">Spending breakdown by category</p>
      </TabsContent>
      <TabsContent value="income" className="pt-4">
        <p className="text-sm text-muted-foreground">Income sources and history</p>
      </TabsContent>
      <TabsContent value="trends" className="pt-4">
        <p className="text-sm text-muted-foreground">Spending trends over time</p>
      </TabsContent>
    </Tabs>
  ),
};

export const SettingsTabs: Story = {
  render: () => (
    <Tabs defaultValue="general" className="w-full max-w-3xl">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
        <TabsTrigger value="integrations">Integrations</TabsTrigger>
      </TabsList>
      <TabsContent value="general" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
            <CardDescription>Manage your account preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Display Name</label>
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2 text-sm"
                defaultValue="John Doe"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                className="w-full rounded-md border px-3 py-2 text-sm"
                defaultValue="john@example.com"
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="notifications">
        <Card>
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
            <CardDescription>Configure how you receive notifications</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Notification settings would go here</p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="security">
        <Card>
          <CardHeader>
            <CardTitle>Security Settings</CardTitle>
            <CardDescription>Manage your account security</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Security settings would go here</p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="integrations">
        <Card>
          <CardHeader>
            <CardTitle>Connected Integrations</CardTitle>
            <CardDescription>Manage your connected accounts and services</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Integration settings would go here</p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
};

export const ManyTabs: Story = {
  render: () => (
    <Tabs defaultValue="food" className="w-full">
      <TabsList>
        <TabsTrigger value="food">Food</TabsTrigger>
        <TabsTrigger value="shopping">Shopping</TabsTrigger>
        <TabsTrigger value="entertainment">Entertainment</TabsTrigger>
        <TabsTrigger value="transport">Transport</TabsTrigger>
        <TabsTrigger value="bills">Bills</TabsTrigger>
        <TabsTrigger value="health">Health</TabsTrigger>
      </TabsList>
      <TabsContent value="food">
        <p className="text-sm py-4">Food & Dining expenses</p>
      </TabsContent>
      <TabsContent value="shopping">
        <p className="text-sm py-4">Shopping expenses</p>
      </TabsContent>
      <TabsContent value="entertainment">
        <p className="text-sm py-4">Entertainment expenses</p>
      </TabsContent>
      <TabsContent value="transport">
        <p className="text-sm py-4">Transport expenses</p>
      </TabsContent>
      <TabsContent value="bills">
        <p className="text-sm py-4">Bills & utilities</p>
      </TabsContent>
      <TabsContent value="health">
        <p className="text-sm py-4">Health & fitness</p>
      </TabsContent>
    </Tabs>
  ),
};

export const VerticalTabs: Story = {
  render: () => (
    <Tabs defaultValue="overview" orientation="vertical" className="flex gap-4">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="transactions">Transactions</TabsTrigger>
        <TabsTrigger value="budget">Budget</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
      </TabsList>
      <div className="flex-1">
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Account Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Dashboard overview</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Transaction history</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="budget">
          <Card>
            <CardHeader>
              <CardTitle>Budget Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Budget management</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Financial Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Reports and analytics</p>
            </CardContent>
          </Card>
        </TabsContent>
      </div>
    </Tabs>
  ),
};
