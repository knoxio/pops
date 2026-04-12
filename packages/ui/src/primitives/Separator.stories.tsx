import type { Meta, StoryObj } from '@storybook/react-vite';

import { Separator } from './separator';

const meta: Meta<typeof Separator> = {
  title: 'Layout/Separator',
  component: Separator,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  args: {
    orientation: 'horizontal',
  },
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-20 items-center">
      <div className="px-4">Item 1</div>
      <Separator orientation="vertical" />
      <div className="px-4">Item 2</div>
      <Separator orientation="vertical" />
      <div className="px-4">Item 3</div>
    </div>
  ),
};

export const InText: Story = {
  render: () => (
    <div className="space-y-1">
      <h4 className="text-sm font-medium">Account Details</h4>
      <p className="text-sm text-muted-foreground">
        Manage your account information and preferences.
      </p>
      <Separator className="my-4" />
      <div className="flex h-5 items-center space-x-4 text-sm">
        <div>Overview</div>
        <Separator orientation="vertical" />
        <div>Transactions</div>
        <Separator orientation="vertical" />
        <div>Settings</div>
      </div>
    </div>
  ),
};

export const InCard: Story = {
  render: () => (
    <div className="w-sm rounded-lg border p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Transaction Details</h3>
        <p className="text-sm text-muted-foreground">Feb 10, 2026</p>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Merchant</span>
          <span>Woolworths Sydney</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-medium">$87.45</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Category</span>
          <span>Food & Dining</span>
        </div>
      </div>

      <Separator />

      <div>
        <p className="text-xs text-muted-foreground">Note</p>
        <p className="text-sm">Weekly grocery shopping</p>
      </div>
    </div>
  ),
};

export const BetweenSections: Story = {
  render: () => (
    <div className="w-150 space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Account Summary</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Balance</p>
            <p className="text-2xl font-bold">$2,458.32</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Income</p>
            <p className="text-2xl font-bold text-green-600">$7,250.00</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Expenses</p>
            <p className="text-2xl font-bold text-red-600">$4,892.34</p>
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Recent Transactions</h2>
        <div className="space-y-2">
          {[
            { desc: 'Woolworths Sydney', date: 'Feb 10', amount: '-$87.45' },
            { desc: 'Netflix Subscription', date: 'Feb 09', amount: '-$22.99' },
            { desc: 'Salary Deposit', date: 'Feb 05', amount: '+$3,500.00' },
          ].map((txn, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{txn.desc}</p>
                <p className="text-xs text-muted-foreground">{txn.date}</p>
              </div>
              <p
                className={`font-medium ${txn.amount.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}
              >
                {txn.amount}
              </p>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Budget Overview</h2>
        <p className="text-sm text-muted-foreground">
          Track your spending across different categories
        </p>
      </div>
    </div>
  ),
};

export const InList: Story = {
  render: () => (
    <div className="w-100 rounded-lg border">
      {[
        { name: 'Checking Account', balance: '$2,458.32' },
        { name: 'Savings Account', balance: '$12,847.65' },
        { name: 'Credit Card', balance: '-$1,234.56' },
        { name: 'Investment Account', balance: '$45,678.90' },
      ].map((account, i, arr) => (
        <div key={i}>
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium">{account.name}</p>
            </div>
            <p className="text-sm font-medium">{account.balance}</p>
          </div>
          {i < arr.length - 1 && <Separator />}
        </div>
      ))}
    </div>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <div className="w-100 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Personal Information</h3>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Full Name</label>
          <input
            type="text"
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="John Doe"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <input
            type="email"
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="john@example.com"
          />
        </div>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <Separator />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Account Settings</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Currency</label>
          <select className="w-full rounded-md border px-3 py-2 text-sm">
            <option>AUD - Australian Dollar</option>
            <option>USD - US Dollar</option>
            <option>EUR - Euro</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Timezone</label>
          <select className="w-full rounded-md border px-3 py-2 text-sm">
            <option>Australia/Sydney</option>
            <option>Australia/Melbourne</option>
            <option>Australia/Brisbane</option>
          </select>
        </div>
      </div>
    </div>
  ),
};

export const Dashboard: Story = {
  render: () => (
    <div className="w-200 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
          Add Transaction
        </button>
      </div>

      <Separator />

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Total Balance', value: '$14,071.41', trend: '+12.5%' },
          { label: 'Income', value: '$7,250.00', trend: '+8.2%' },
          { label: 'Expenses', value: '$4,892.34', trend: '-3.1%' },
          { label: 'Savings', value: '$2,357.66', trend: '+15.3%' },
        ].map((stat, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-2">
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-xs text-green-600">{stat.trend}</p>
          </div>
        ))}
      </div>

      <Separator />

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Spending by Category</h2>
          <div className="h-50 rounded-lg border flex items-center justify-center text-muted-foreground">
            Chart placeholder
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Recent Activity</h2>
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Transaction {i}</span>
                  <span className="text-sm font-medium">$XX.XX</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  ),
};

export const InNav: Story = {
  render: () => (
    <div className="flex h-16 items-center space-x-4 rounded-lg border px-4">
      <div className="font-semibold">POPS</div>
      <Separator orientation="vertical" />
      <nav className="flex items-center space-x-4 text-sm">
        <a href="#" className="transition-colors hover:text-foreground/80">
          Dashboard
        </a>
        <a href="#" className="transition-colors hover:text-foreground/80">
          Transactions
        </a>
        <a href="#" className="transition-colors hover:text-foreground/80">
          Budget
        </a>
        <a href="#" className="transition-colors hover:text-foreground/80">
          Reports
        </a>
      </nav>
      <div className="ml-auto flex items-center space-x-4">
        <button className="text-sm">Settings</button>
        <Separator orientation="vertical" />
        <button className="text-sm">Profile</button>
      </div>
    </div>
  ),
};
