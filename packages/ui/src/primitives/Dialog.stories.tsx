import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Button } from "../components/Button";
import { TextInput } from "../components/TextInput";
import { NumberInput } from "../components/NumberInput";
import { DateTimeInput } from "../components/DateTimeInput";
import { Select } from "../components/Select";

const meta: Meta<typeof Dialog> = {
  title: "Feedback/Dialog",
  component: Dialog,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {},
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open Dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transaction Details</DialogTitle>
          <DialogDescription>View the full details of this transaction.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">Description</p>
            <p className="text-sm text-muted-foreground">WOOLWORTHS 1234 SYDNEY AU</p>
          </div>
          <div>
            <p className="text-sm font-medium">Amount</p>
            <p className="text-sm text-muted-foreground">$87.45</p>
          </div>
          <div>
            <p className="text-sm font-medium">Date</p>
            <p className="text-sm text-muted-foreground">2026-02-10</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  ),
};

export const Confirmation: Story = {
  args: {},
  render: () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive">Delete Transaction</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription>
              This will permanently delete this transaction. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setIsOpen(false);
                // Handle delete
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
};

export const Form: Story = {
  args: {},
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    const [formData, setFormData] = useState({
      description: "",
      amount: undefined as number | undefined,
      date: "",
      category: "",
      account: "",
    });

    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button>Add Transaction</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-125">
          <DialogHeader>
            <DialogTitle>New Transaction</DialogTitle>
            <DialogDescription>Add a new transaction to your balance sheet.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Description</label>
              <TextInput
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter transaction description"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Amount</label>
              <NumberInput
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                placeholder="0.00"
                prefix="$"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Date</label>
              <DateTimeInput
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                options={[
                  { label: "Food", value: "food" },
                  { label: "Shopping", value: "shopping" },
                  { label: "Entertainment", value: "entertainment" },
                  { label: "Transport", value: "transport" },
                  { label: "Bills", value: "bills" },
                ]}
                placeholder="Select category"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Account</label>
              <Select
                value={formData.account}
                onChange={(e) => setFormData({ ...formData, account: e.target.value })}
                options={[
                  { label: "Checking", value: "checking" },
                  { label: "Savings", value: "savings" },
                  { label: "Credit Card", value: "credit" },
                ]}
                placeholder="Select account"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setIsOpen(false);
                // Handle save
              }}
            >
              Save Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
};

export const NoCloseButton: Story = {
  args: {},
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open Modal</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Processing Transaction</DialogTitle>
          <DialogDescription>
            Please wait while we process your transaction. This may take a few moments.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DialogContent>
    </Dialog>
  ),
};

export const LongContent: Story = {
  args: {},
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>View Terms</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Terms and Conditions</DialogTitle>
          <DialogDescription>Please review our terms and conditions carefully.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam euismod, nisl eget
            ultricies aliquam, nunc nisl aliquet nunc, vitae aliquam nisl nunc vitae nisl. Nullam
            euismod, nisl eget ultricies aliquam, nunc nisl aliquet nunc, vitae aliquam nisl nunc
            vitae nisl.
          </p>
          <p>
            Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque
            laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi
            architecto beatae vitae dicta sunt explicabo.
          </p>
          <p>
            Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia
            consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.
          </p>
          <p>
            Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci
            velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam
            aliquam quaerat voluptatem.
          </p>
          <p>
            Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit
            laboriosam, nisi ut aliquid ex ea commodi consequatur?
          </p>
        </div>
        <DialogFooter showCloseButton>
          <Button>Accept</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const NestedDialog: Story = {
  args: {},
  render: () => {
    const [outerOpen, setOuterOpen] = useState(false);
    const [innerOpen, setInnerOpen] = useState(false);

    return (
      <Dialog open={outerOpen} onOpenChange={setOuterOpen}>
        <DialogTrigger asChild>
          <Button>Open Outer Dialog</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Outer Dialog</DialogTitle>
            <DialogDescription>This dialog contains another dialog.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Dialog open={innerOpen} onOpenChange={setInnerOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Open Inner Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Inner Dialog</DialogTitle>
                  <DialogDescription>This is a nested dialog.</DialogDescription>
                </DialogHeader>
                <p className="text-sm">
                  Dialogs can be nested when needed, though it should be used sparingly.
                </p>
                <DialogFooter>
                  <Button onClick={() => setInnerOpen(false)}>Close</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </DialogContent>
      </Dialog>
    );
  },
};
