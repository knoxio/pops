import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { CheckboxInput } from "./CheckboxInput";

const meta: Meta<typeof CheckboxInput> = {
  title: "Inputs/Checkbox",
  component: CheckboxInput,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "400px", padding: "2rem" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
  render: () => {
    const [checked, setChecked] = useState(false);
    return (
      <CheckboxInput
        label="Accept terms and conditions"
        checked={checked}
        onCheckedChange={setChecked}
      />
    );
  },
};

export const WithDescription: Story = {
  args: {},
  render: () => {
    const [checked, setChecked] = useState(false);
    return (
      <CheckboxInput
        label="Subscribe to newsletter"
        description="Get weekly updates about new features and product announcements"
        checked={checked}
        onCheckedChange={setChecked}
      />
    );
  },
};

export const Required: Story = {
  args: {},
  render: () => {
    const [checked, setChecked] = useState(false);
    return (
      <CheckboxInput
        label="I agree to the terms"
        required
        checked={checked}
        onCheckedChange={setChecked}
      />
    );
  },
};

export const WithError: Story = {
  args: {},
  render: () => {
    const [checked, setChecked] = useState(false);
    return (
      <CheckboxInput
        label="Accept privacy policy"
        required
        error
        errorMessage="You must accept the privacy policy to continue"
        checked={checked}
        onCheckedChange={setChecked}
      />
    );
  },
};

export const Disabled: Story = {
  args: {},
  render: () => {
    return (
      <CheckboxInput
        label="This option is disabled"
        description="You cannot change this setting"
        disabled
        checked={true}
      />
    );
  },
};

export const LabelLeft: Story = {
  args: {},
  render: () => {
    const [checked, setChecked] = useState(false);
    return (
      <CheckboxInput
        label="Send notifications"
        labelPosition="left"
        checked={checked}
        onCheckedChange={setChecked}
      />
    );
  },
};

export const MultipleCheckboxes: Story = {
  args: {},
  render: () => {
    const [preferences, setPreferences] = useState({
      email: false,
      sms: false,
      push: false,
    });

    return (
      <div className="flex flex-col gap-4">
        <div className="text-sm font-medium">Notification Preferences</div>
        <CheckboxInput
          label="Email notifications"
          description="Receive updates via email"
          checked={preferences.email}
          onCheckedChange={(checked) =>
            setPreferences({ ...preferences, email: checked })
          }
        />
        <CheckboxInput
          label="SMS notifications"
          description="Receive updates via text message"
          checked={preferences.sms}
          onCheckedChange={(checked) =>
            setPreferences({ ...preferences, sms: checked })
          }
        />
        <CheckboxInput
          label="Push notifications"
          description="Receive push notifications in your browser"
          checked={preferences.push}
          onCheckedChange={(checked) =>
            setPreferences({ ...preferences, push: checked })
          }
        />
      </div>
    );
  },
};

export const DefaultChecked: Story = {
  args: {},
  render: () => {
    return (
      <CheckboxInput
        label="Remember me"
        description="Stay logged in for 30 days"
        defaultChecked={true}
      />
    );
  },
};
