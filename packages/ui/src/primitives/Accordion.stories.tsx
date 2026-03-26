import type { Meta, StoryObj } from "@storybook/react-vite";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion";

const meta: Meta = {
  title: "Layout/Accordion",
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-full max-w-2xl">
      <AccordionItem value="item-1">
        <AccordionTrigger>What is POPS?</AccordionTrigger>
        <AccordionContent>
          POPS (Personal Operations System) is a self-hosted financial tracking and automation
          platform that uses SQLite as the source of truth for all data.
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="item-2">
        <AccordionTrigger>How does it work?</AccordionTrigger>
        <AccordionContent>
          Bank data is imported via CSV or API, matched with entities using a 5-stage pipeline, and
          written directly to SQLite for fast queries.
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="item-3">
        <AccordionTrigger>Is my data secure?</AccordionTrigger>
        <AccordionContent>
          Yes, POPS is self-hosted on your own infrastructure with Cloudflare Access for
          authentication. All secrets are managed via Docker secrets and Ansible Vault.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const Multiple: Story = {
  render: () => (
    <Accordion type="multiple" className="w-full max-w-2xl">
      <AccordionItem value="item-1">
        <AccordionTrigger>Account Features</AccordionTrigger>
        <AccordionContent>
          <ul className="list-disc pl-5 space-y-1">
            <li>Multi-account tracking</li>
            <li>Automatic categorization</li>
            <li>Budget management</li>
            <li>Transaction history</li>
          </ul>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="item-2">
        <AccordionTrigger>Integrations</AccordionTrigger>
        <AccordionContent>
          <ul className="list-disc pl-5 space-y-1">
            <li>Up Bank API</li>
            <li>ANZ CSV Import</li>
            <li>Amex CSV Import</li>
            <li>ING CSV Import</li>
          </ul>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="item-3">
        <AccordionTrigger>AI Features</AccordionTrigger>
        <AccordionContent>
          <ul className="list-disc pl-5 space-y-1">
            <li>Entity matching</li>
            <li>Transaction categorization</li>
            <li>Spending insights</li>
            <li>Budget recommendations</li>
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const DefaultOpen: Story = {
  render: () => (
    <Accordion type="single" collapsible defaultValue="item-1" className="w-full max-w-2xl">
      <AccordionItem value="item-1">
        <AccordionTrigger>Getting Started</AccordionTrigger>
        <AccordionContent>
          This section is open by default. Follow the setup guide to configure your POPS instance.
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="item-2">
        <AccordionTrigger>Configuration</AccordionTrigger>
        <AccordionContent>
          Configure your environment variables and integration settings.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const FAQ: Story = {
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Frequently Asked Questions</h2>
        <p className="text-muted-foreground">Find answers to common questions about using POPS</p>
      </div>

      <Accordion type="single" collapsible>
        <AccordionItem value="q1">
          <AccordionTrigger>How do I import transactions?</AccordionTrigger>
          <AccordionContent>
            You can import transactions in several ways:
            <ol className="list-decimal pl-5 mt-2 space-y-1">
              <li>Upload CSV files from your bank</li>
              <li>Connect via Up Bank API for automatic syncing</li>
              <li>Manually add transactions through the interface</li>
            </ol>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="q2">
          <AccordionTrigger>Can I track multiple accounts?</AccordionTrigger>
          <AccordionContent>
            Yes, POPS supports unlimited accounts including checking, savings, credit cards, and
            investment accounts. Each transaction is tagged with its source account.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="q3">
          <AccordionTrigger>How accurate is AI categorization?</AccordionTrigger>
          <AccordionContent>
            The AI categorization achieves 95-100% accuracy with the 5-stage entity matching
            pipeline: manual aliases → exact match → prefix match → contains match → AI fallback.
            Results are cached for consistency.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="q4">
          <AccordionTrigger>Can I export my data?</AccordionTrigger>
          <AccordionContent>
            Yes, SQLite is the source of truth, so you can export your data at any time in CSV or
            other formats via the API.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="q5">
          <AccordionTrigger>Is there a mobile app?</AccordionTrigger>
          <AccordionContent>
            POPS includes a Progressive Web App (PWA) that works on mobile devices through your
            browser. You can install it to your home screen for an app-like experience.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  ),
};

export const BudgetCategories: Story = {
  render: () => (
    <div className="w-full max-w-2xl space-y-4">
      <h3 className="text-lg font-semibold">Budget Categories</h3>

      <Accordion type="single" collapsible>
        <AccordionItem value="food">
          <AccordionTrigger>
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-blue-600" />
              <span>Food & Dining</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Budget:</span>
                <span className="font-medium">$600 / month</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Spent:</span>
                <span className="font-medium text-green-600">$450</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Remaining:</span>
                <span className="font-medium">$150</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div className="h-full rounded-full bg-blue-600" style={{ width: "75%" }} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="shopping">
          <AccordionTrigger>
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-pink-600" />
              <span>Shopping</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Budget:</span>
                <span className="font-medium">$400 / month</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Spent:</span>
                <span className="font-medium text-yellow-600">$340</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Remaining:</span>
                <span className="font-medium">$60</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div className="h-full rounded-full bg-pink-600" style={{ width: "85%" }} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="entertainment">
          <AccordionTrigger>
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-orange-600" />
              <span>Entertainment</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Budget:</span>
                <span className="font-medium">$200 / month</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Spent:</span>
                <span className="font-medium text-red-600">$245</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Over budget:</span>
                <span className="font-medium text-red-600">$45</span>
              </div>
              <div className="h-2 w-full rounded-full bg-red-200">
                <div className="h-full rounded-full bg-red-600" style={{ width: "100%" }} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  ),
};

export const TransactionDetails: Story = {
  render: () => (
    <div className="w-full max-w-2xl">
      <Accordion type="single" collapsible>
        <AccordionItem value="txn-1">
          <AccordionTrigger>
            <div className="flex items-center justify-between w-full pr-4">
              <span className="font-medium">Woolworths Sydney</span>
              <span className="text-red-600 font-medium">-$87.45</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">Feb 10, 2026</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Account</p>
                  <p className="font-medium">Checking</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Category</p>
                  <p className="font-medium">Food & Dining</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium text-green-600">Completed</p>
                </div>
              </div>
              <div className="pt-2">
                <p className="text-muted-foreground text-sm">Note</p>
                <p className="text-sm">Weekly grocery shopping</p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="txn-2">
          <AccordionTrigger>
            <div className="flex items-center justify-between w-full pr-4">
              <span className="font-medium">Netflix Subscription</span>
              <span className="text-red-600 font-medium">-$22.99</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">Feb 09, 2026</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Account</p>
                  <p className="font-medium">Credit Card</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Category</p>
                  <p className="font-medium">Entertainment</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium text-yellow-600">Pending</p>
                </div>
              </div>
              <div className="pt-2">
                <p className="text-muted-foreground text-sm">Note</p>
                <p className="text-sm">Monthly recurring charge</p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="txn-3">
          <AccordionTrigger>
            <div className="flex items-center justify-between w-full pr-4">
              <span className="font-medium">Salary Deposit</span>
              <span className="text-green-600 font-medium">+$3,500.00</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">Feb 05, 2026</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Account</p>
                  <p className="font-medium">Checking</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Category</p>
                  <p className="font-medium">Income</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium text-green-600">Completed</p>
                </div>
              </div>
              <div className="pt-2">
                <p className="text-muted-foreground text-sm">Note</p>
                <p className="text-sm">Bi-weekly salary payment</p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  ),
};

export const Settings: Story = {
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>

      <Accordion type="single" collapsible>
        <AccordionItem value="account">
          <AccordionTrigger>Account Settings</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <input
                  type="email"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  defaultValue="user@example.com"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Display Name</label>
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  defaultValue="John Doe"
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="notifications">
          <AccordionTrigger>Notification Preferences</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Email notifications</span>
                <input type="checkbox" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Budget alerts</span>
                <input type="checkbox" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Transaction updates</span>
                <input type="checkbox" />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="privacy">
          <AccordionTrigger>Privacy & Security</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              <button className="w-full rounded-md border px-4 py-2 text-sm text-left hover:bg-accent">
                Change Password
              </button>
              <button className="w-full rounded-md border px-4 py-2 text-sm text-left hover:bg-accent">
                Two-Factor Authentication
              </button>
              <button className="w-full rounded-md border px-4 py-2 text-sm text-left hover:bg-accent">
                Export Data
              </button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  ),
};
