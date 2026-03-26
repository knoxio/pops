import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Switch } from "./switch";

const meta: Meta<typeof Switch> = {
  title: "Inputs/Switch",
  component: Switch,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
  render: () => {
    const [checked, setChecked] = useState(false);
    return (
      <div className="flex items-center gap-4">
        <Switch checked={checked} onCheckedChange={setChecked} />
        <span className="text-sm">{checked ? "On" : "Off"}</span>
      </div>
    );
  },
};

export const DefaultChecked: Story = {
  args: {},
  render: () => {
    const [checked, setChecked] = useState(true);
    return (
      <div className="flex items-center gap-4">
        <Switch checked={checked} onCheckedChange={setChecked} />
        <span className="text-sm">{checked ? "Enabled" : "Disabled"}</span>
      </div>
    );
  },
};

export const Disabled: Story = {
  args: {},
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Switch disabled checked={false} />
        <span className="text-sm text-muted-foreground">Disabled (off)</span>
      </div>
      <div className="flex items-center gap-4">
        <Switch disabled checked={true} />
        <span className="text-sm text-muted-foreground">Disabled (on)</span>
      </div>
    </div>
  ),
};

export const Sizes: Story = {
  args: {},
  render: () => (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <Switch size="sm" defaultChecked />
        <span className="text-sm">Small</span>
      </div>
      <div className="flex items-center gap-2">
        <Switch size="default" defaultChecked />
        <span className="text-sm">Default</span>
      </div>
    </div>
  ),
};

export const WithLabel: Story = {
  args: {},
  render: () => {
    const [checked, setChecked] = useState(false);
    return (
      <div className="flex items-center space-x-2">
        <Switch id="airplane-mode" checked={checked} onCheckedChange={setChecked} />
        <label
          htmlFor="airplane-mode"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
        >
          Airplane Mode
        </label>
      </div>
    );
  },
};

export const Settings: Story = {
  args: {},
  render: () => {
    const [notifications, setNotifications] = useState(true);
    const [marketing, setMarketing] = useState(false);
    const [security, setSecurity] = useState(true);

    return (
      <div className="space-y-6 w-80">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Notification Settings</h3>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Push Notifications</label>
              <p className="text-xs text-muted-foreground">
                Receive notifications about account activity
              </p>
            </div>
            <Switch checked={notifications} onCheckedChange={setNotifications} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Marketing Emails</label>
              <p className="text-xs text-muted-foreground">
                Receive emails about new features and offers
              </p>
            </div>
            <Switch checked={marketing} onCheckedChange={setMarketing} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Security Alerts</label>
              <p className="text-xs text-muted-foreground">Get notified about security events</p>
            </div>
            <Switch checked={security} onCheckedChange={setSecurity} />
          </div>
        </div>
      </div>
    );
  },
};

export const BudgetToggles: Story = {
  args: {},
  render: () => {
    const [food, setFood] = useState(true);
    const [shopping, setShopping] = useState(true);
    const [entertainment, setEntertainment] = useState(false);
    const [transport, setTransport] = useState(true);

    return (
      <div className="space-y-4 w-80">
        <h3 className="text-lg font-semibold">Active Budget Categories</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-blue-600" />
              <span className="text-sm font-medium">Food & Dining</span>
            </div>
            <Switch checked={food} onCheckedChange={setFood} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-pink-600" />
              <span className="text-sm font-medium">Shopping</span>
            </div>
            <Switch checked={shopping} onCheckedChange={setShopping} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-orange-600" />
              <span className="text-sm font-medium">Entertainment</span>
            </div>
            <Switch checked={entertainment} onCheckedChange={setEntertainment} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-green-600" />
              <span className="text-sm font-medium">Transport</span>
            </div>
            <Switch checked={transport} onCheckedChange={setTransport} />
          </div>
        </div>
      </div>
    );
  },
};

export const AccountFeatures: Story = {
  args: {},
  render: () => {
    const [autoCategorize, setAutoCategorize] = useState(true);
    const [recurringDetect, setRecurringDetect] = useState(true);
    const [budgetAlerts, setBudgetAlerts] = useState(true);
    const [aiSuggestions, setAiSuggestions] = useState(false);

    return (
      <div className="space-y-6 w-96">
        <div>
          <h3 className="text-lg font-semibold">Smart Features</h3>
          <p className="text-sm text-muted-foreground">Automate your financial tracking</p>
        </div>

        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Auto-Categorization</label>
              <p className="text-xs text-muted-foreground">
                Automatically categorize transactions using AI
              </p>
            </div>
            <Switch checked={autoCategorize} onCheckedChange={setAutoCategorize} />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Recurring Detection</label>
              <p className="text-xs text-muted-foreground">Identify and track recurring expenses</p>
            </div>
            <Switch checked={recurringDetect} onCheckedChange={setRecurringDetect} />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Budget Alerts</label>
              <p className="text-xs text-muted-foreground">
                Get notified when approaching budget limits
              </p>
            </div>
            <Switch checked={budgetAlerts} onCheckedChange={setBudgetAlerts} />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">AI Suggestions</label>
              <p className="text-xs text-muted-foreground">
                Receive personalized savings suggestions
              </p>
            </div>
            <Switch checked={aiSuggestions} onCheckedChange={setAiSuggestions} />
          </div>
        </div>
      </div>
    );
  },
};

export const InForm: Story = {
  args: {},
  render: () => {
    const [formData, setFormData] = useState({
      name: "",
      email: "",
      subscribe: true,
      terms: false,
    });

    return (
      <div className="w-96 space-y-6 rounded-lg border p-6">
        <h3 className="text-lg font-semibold">Account Setup</h3>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <input
              type="text"
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Subscribe to newsletter</label>
            <Switch
              checked={formData.subscribe}
              onCheckedChange={(checked) => setFormData({ ...formData, subscribe: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Accept terms & conditions</label>
            <Switch
              checked={formData.terms}
              onCheckedChange={(checked) => setFormData({ ...formData, terms: checked })}
            />
          </div>
        </div>
      </div>
    );
  },
};
