import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarBadge,
  AvatarGroup,
  AvatarGroupCount,
} from "./avatar";
import { CheckIcon, UserIcon } from "lucide-react";

const meta: Meta<typeof Avatar> = {
  title: "Data Display/Avatar",
  component: Avatar,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
  render: () => (
    <Avatar>
      <AvatarImage
        src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop"
        alt="User"
      />
      <AvatarFallback>JD</AvatarFallback>
    </Avatar>
  ),
};

export const WithFallback: Story = {
  args: {},
  render: () => (
    <Avatar>
      <AvatarImage src="/nonexistent.jpg" alt="User" />
      <AvatarFallback>JD</AvatarFallback>
    </Avatar>
  ),
};

export const FallbackOnly: Story = {
  args: {},
  render: () => (
    <div className="flex gap-4">
      <Avatar>
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>CD</AvatarFallback>
      </Avatar>
    </div>
  ),
};

export const Sizes: Story = {
  args: {},
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar size="sm">
        <AvatarImage
          src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop"
          alt="User"
        />
        <AvatarFallback>SM</AvatarFallback>
      </Avatar>
      <Avatar size="default">
        <AvatarImage
          src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop"
          alt="User"
        />
        <AvatarFallback>MD</AvatarFallback>
      </Avatar>
      <Avatar size="lg">
        <AvatarImage
          src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop"
          alt="User"
        />
        <AvatarFallback>LG</AvatarFallback>
      </Avatar>
    </div>
  ),
};

export const CustomSizes: Story = {
  args: {},
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar className="h-6 w-6">
        <AvatarFallback className="text-2xs">XS</AvatarFallback>
      </Avatar>
      <Avatar className="h-12 w-12">
        <AvatarFallback>XL</AvatarFallback>
      </Avatar>
      <Avatar className="h-16 w-16">
        <AvatarFallback className="text-lg">2X</AvatarFallback>
      </Avatar>
      <Avatar className="h-24 w-24">
        <AvatarFallback className="text-2xl">3X</AvatarFallback>
      </Avatar>
    </div>
  ),
};

export const WithBadge: Story = {
  args: {},
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar>
        <AvatarImage
          src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop"
          alt="User"
        />
        <AvatarFallback>JD</AvatarFallback>
        <AvatarBadge />
      </Avatar>
      <Avatar>
        <AvatarImage
          src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop"
          alt="User"
        />
        <AvatarFallback>AB</AvatarFallback>
        <AvatarBadge className="bg-green-600">
          <CheckIcon />
        </AvatarBadge>
      </Avatar>
      <Avatar>
        <AvatarFallback>CD</AvatarFallback>
        <AvatarBadge className="bg-yellow-600" />
      </Avatar>
    </div>
  ),
};

export const OnlineStatus: Story = {
  args: {},
  render: () => (
    <div className="flex items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <Avatar>
          <AvatarImage
            src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop"
            alt="User"
          />
          <AvatarFallback>ON</AvatarFallback>
          <AvatarBadge className="bg-green-600" />
        </Avatar>
        <span className="text-xs text-muted-foreground">Online</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Avatar>
          <AvatarImage
            src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop"
            alt="User"
          />
          <AvatarFallback>AW</AvatarFallback>
          <AvatarBadge className="bg-yellow-600" />
        </Avatar>
        <span className="text-xs text-muted-foreground">Away</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Avatar>
          <AvatarFallback>OF</AvatarFallback>
          <AvatarBadge className="bg-gray-600" />
        </Avatar>
        <span className="text-xs text-muted-foreground">Offline</span>
      </div>
    </div>
  ),
};

export const Group: Story = {
  args: {},
  render: () => (
    <AvatarGroup>
      <Avatar>
        <AvatarImage
          src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop"
          alt="User 1"
        />
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage
          src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop"
          alt="User 2"
        />
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage
          src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop"
          alt="User 3"
        />
        <AvatarFallback>CD</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>EF</AvatarFallback>
      </Avatar>
    </AvatarGroup>
  ),
};

export const GroupWithCount: Story = {
  args: {},
  render: () => (
    <AvatarGroup>
      <Avatar>
        <AvatarImage
          src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop"
          alt="User 1"
        />
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage
          src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop"
          alt="User 2"
        />
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage
          src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop"
          alt="User 3"
        />
        <AvatarFallback>CD</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+5</AvatarGroupCount>
    </AvatarGroup>
  ),
};

export const WithIcon: Story = {
  args: {},
  render: () => (
    <div className="flex gap-4">
      <Avatar>
        <AvatarFallback>
          <UserIcon className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <Avatar size="lg">
        <AvatarFallback>
          <UserIcon className="h-6 w-6" />
        </AvatarFallback>
      </Avatar>
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
            <th className="p-3 text-left text-sm font-medium">User</th>
            <th className="p-3 text-left text-sm font-medium">Role</th>
            <th className="p-3 text-left text-sm font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="p-3">
              <div className="flex items-center gap-3">
                <Avatar size="sm">
                  <AvatarImage
                    src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop"
                    alt="John Doe"
                  />
                  <AvatarFallback>JD</AvatarFallback>
                  <AvatarBadge className="bg-green-600" />
                </Avatar>
                <div>
                  <p className="text-sm font-medium">John Doe</p>
                  <p className="text-xs text-muted-foreground">john@example.com</p>
                </div>
              </div>
            </td>
            <td className="p-3 text-sm">Admin</td>
            <td className="p-3 text-sm">Active</td>
          </tr>
          <tr className="border-b">
            <td className="p-3">
              <div className="flex items-center gap-3">
                <Avatar size="sm">
                  <AvatarImage
                    src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop"
                    alt="Alice Brown"
                  />
                  <AvatarFallback>AB</AvatarFallback>
                  <AvatarBadge className="bg-yellow-600" />
                </Avatar>
                <div>
                  <p className="text-sm font-medium">Alice Brown</p>
                  <p className="text-xs text-muted-foreground">alice@example.com</p>
                </div>
              </div>
            </td>
            <td className="p-3 text-sm">User</td>
            <td className="p-3 text-sm">Away</td>
          </tr>
          <tr>
            <td className="p-3">
              <div className="flex items-center gap-3">
                <Avatar size="sm">
                  <AvatarFallback>CD</AvatarFallback>
                  <AvatarBadge className="bg-gray-600" />
                </Avatar>
                <div>
                  <p className="text-sm font-medium">Charlie Davis</p>
                  <p className="text-xs text-muted-foreground">charlie@example.com</p>
                </div>
              </div>
            </td>
            <td className="p-3 text-sm">User</td>
            <td className="p-3 text-sm">Offline</td>
          </tr>
        </tbody>
      </table>
    </div>
  ),
};

export const ColoredFallbacks: Story = {
  args: {},
  render: () => (
    <div className="flex gap-4">
      <Avatar>
        <AvatarFallback className="bg-blue-600 text-white">JD</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-green-600 text-white">AB</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-purple-600 text-white">CD</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-orange-600 text-white">EF</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-pink-600 text-white">GH</AvatarFallback>
      </Avatar>
    </div>
  ),
};
