import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { InfiniteScrollTable } from "./InfiniteScrollTable";
import { SortableHeader } from "./DataTable";

const meta: Meta<typeof InfiniteScrollTable> = {
  title: "Data Display/Table/Infinite Scroll",
  component: InfiniteScrollTable,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
}

// Generate sample transactions
const generateTransactions = (count: number, offset: number): Transaction[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `txn-${offset + i + 1}`,
    date: new Date(2024, 0, offset + i + 1).toISOString().split("T")[0],
    description: [
      "Woolworths",
      "Coles",
      "Amazon",
      "Netflix",
      "Uber",
      "Spotify",
      "Apple",
      "Google",
    ][(offset + i) % 8],
    amount: Math.random() * 200 - 100,
    category: ["Food", "Shopping", "Entertainment", "Transport"][
      (offset + i) % 4
    ],
  }));
};

const transactionColumns: ColumnDef<Transaction>[] = [
  {
    accessorKey: "date",
    header: ({ column }) => (
      <SortableHeader column={column}>Date</SortableHeader>
    ),
  },
  {
    accessorKey: "description",
    header: "Description",
  },
  {
    accessorKey: "amount",
    header: ({ column }) => (
      <SortableHeader column={column}>Amount</SortableHeader>
    ),
    cell: ({ row }) => {
      const amount = row.getValue("amount") as number;
      const formatted = new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
      }).format(amount);
      return (
        <span className={amount < 0 ? "text-red-600" : "text-green-600"}>
          {formatted}
        </span>
      );
    },
  },
  {
    accessorKey: "category",
    header: "Category",
  },
];

export const Default: Story = {
  args: {},
  render: () => {
    const [transactions, setTransactions] = useState<Transaction[]>(
      generateTransactions(20, 0)
    );
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);

    const loadMore = async () => {
      setLoading(true);
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const newTransactions = generateTransactions(20, transactions.length);
      setTransactions([...transactions, ...newTransactions]);

      // Stop after 100 items for demo
      if (transactions.length + newTransactions.length >= 100) {
        setHasMore(false);
      }

      setLoading(false);
    };

    return (
      <div style={{ maxHeight: "600px", overflow: "auto" }}>
        <InfiniteScrollTable
          columns={transactionColumns}
          data={transactions}
          onLoadMore={loadMore}
          hasMore={hasMore}
          loading={loading}
        />
      </div>
    );
  },
};

export const WithSearch: Story = {
  args: {},
  render: () => {
    const [transactions, setTransactions] = useState<Transaction[]>(
      generateTransactions(20, 0)
    );
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);

    const loadMore = async () => {
      setLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 800));

      const newTransactions = generateTransactions(20, transactions.length);
      setTransactions([...transactions, ...newTransactions]);

      if (transactions.length + newTransactions.length >= 80) {
        setHasMore(false);
      }

      setLoading(false);
    };

    return (
      <div style={{ maxHeight: "600px", overflow: "auto" }}>
        <InfiniteScrollTable
          columns={transactionColumns}
          data={transactions}
          onLoadMore={loadMore}
          hasMore={hasMore}
          loading={loading}
          searchable
          searchColumn="description"
          searchPlaceholder="Search transactions..."
        />
      </div>
    );
  },
};

export const SmallBatches: Story = {
  args: {},
  render: () => {
    const [transactions, setTransactions] = useState<Transaction[]>(
      generateTransactions(5, 0)
    );
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);

    const loadMore = async () => {
      setLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const newTransactions = generateTransactions(5, transactions.length);
      setTransactions([...transactions, ...newTransactions]);

      if (transactions.length + newTransactions.length >= 50) {
        setHasMore(false);
      }

      setLoading(false);
    };

    return (
      <div style={{ maxHeight: "400px", overflow: "auto" }}>
        <InfiniteScrollTable
          columns={transactionColumns}
          data={transactions}
          onLoadMore={loadMore}
          hasMore={hasMore}
          loading={loading}
        />
      </div>
    );
  },
};
