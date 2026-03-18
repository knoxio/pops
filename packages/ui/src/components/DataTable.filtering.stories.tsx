import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, SortableHeader } from "./DataTable";
import type { ColumnFilter } from "./DataTableFilters";
import {
  dateRangeFilter,
  numberRangeFilter,
  multiSelectFilter,
} from "./DataTableFilters";

const meta: Meta<typeof DataTable> = {
  title: "Data Display/Table/Filtering",
  component: DataTable,
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
  account: string;
  status: "pending" | "completed" | "failed";
}

// Generate sample transactions
const sampleTransactions: Transaction[] = Array.from(
  { length: 100 },
  (_, i) => ({
    id: `txn-${i + 1}`,
    date: new Date(2024, Math.floor(i / 10), (i % 10) + 1)
      .toISOString()
      .split("T")[0],
    description: [
      "Woolworths",
      "Coles",
      "Amazon",
      "Netflix",
      "Uber",
      "Spotify",
      "Apple",
      "Google",
    ][i % 8],
    amount: Math.random() * 400 - 200,
    category: ["Food", "Shopping", "Entertainment", "Transport", "Bills"][
      i % 5
    ],
    account: ["Checking", "Savings", "Credit Card"][i % 3],
    status: (["pending", "completed", "failed"] as const)[i % 3],
  })
);

const transactionColumns: ColumnDef<Transaction>[] = [
  {
    accessorKey: "date",
    header: ({ column }) => (
      <SortableHeader column={column}>Date</SortableHeader>
    ),
    filterFn: dateRangeFilter,
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
    filterFn: numberRangeFilter,
  },
  {
    accessorKey: "category",
    header: "Category",
    filterFn: multiSelectFilter,
  },
  {
    accessorKey: "account",
    header: "Account",
    filterFn: multiSelectFilter,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      const colors = {
        pending: "text-yellow-600",
        completed: "text-green-600",
        failed: "text-red-600",
      };
      return (
        <span className={colors[status as keyof typeof colors]}>{status}</span>
      );
    },
    filterFn: multiSelectFilter,
  },
];

export const TextFilter: Story = {
  args: {},
  render: () => {
    const filters: ColumnFilter[] = [
      {
        id: "description",
        type: "text",
        label: "Merchant",
        placeholder: "Search by merchant name...",
      },
    ];

    return (
      <DataTable
        columns={transactionColumns}
        data={sampleTransactions}
        filters={filters}
        paginated
        defaultPageSize={10}
      />
    );
  },
};

export const SelectFilter: Story = {
  args: {},
  render: () => {
    const filters: ColumnFilter[] = [
      {
        id: "account",
        type: "select",
        label: "Account",
        options: [
          { label: "All Accounts", value: "" },
          { label: "Checking", value: "Checking" },
          { label: "Savings", value: "Savings" },
          { label: "Credit Card", value: "Credit Card" },
        ],
      },
      {
        id: "status",
        type: "select",
        label: "Status",
        options: [
          { label: "All Statuses", value: "" },
          { label: "Pending", value: "pending" },
          { label: "Completed", value: "completed" },
          { label: "Failed", value: "failed" },
        ],
      },
    ];

    return (
      <DataTable
        columns={transactionColumns}
        data={sampleTransactions}
        filters={filters}
        paginated
        defaultPageSize={10}
      />
    );
  },
};

export const MultiSelectFilter: Story = {
  args: {},
  render: () => {
    const filters: ColumnFilter[] = [
      {
        id: "category",
        type: "multiselect",
        label: "Categories",
        placeholder: "Select categories...",
        options: [
          { label: "Food", value: "Food" },
          { label: "Shopping", value: "Shopping" },
          { label: "Entertainment", value: "Entertainment" },
          { label: "Transport", value: "Transport" },
          { label: "Bills", value: "Bills" },
        ],
      },
      {
        id: "account",
        type: "multiselect",
        label: "Accounts",
        placeholder: "Select accounts...",
        options: [
          { label: "Checking", value: "Checking" },
          { label: "Savings", value: "Savings" },
          { label: "Credit Card", value: "Credit Card" },
        ],
      },
    ];

    return (
      <DataTable
        columns={transactionColumns}
        data={sampleTransactions}
        filters={filters}
        filterFns={{
          multiSelectFilter,
        }}
        paginated
        defaultPageSize={10}
      />
    );
  },
};

export const DateRangeFilter: Story = {
  args: {},
  render: () => {
    const filters: ColumnFilter[] = [
      {
        id: "date",
        type: "daterange",
        label: "Date Range",
      },
    ];

    return (
      <DataTable
        columns={transactionColumns}
        data={sampleTransactions}
        filters={filters}
        filterFns={{
          dateRangeFilter,
        }}
        paginated
        defaultPageSize={10}
      />
    );
  },
};

export const NumberRangeFilter: Story = {
  args: {},
  render: () => {
    const filters: ColumnFilter[] = [
      {
        id: "amount",
        type: "numberrange",
        label: "Amount Range",
      },
    ];

    return (
      <DataTable
        columns={transactionColumns}
        data={sampleTransactions}
        filters={filters}
        filterFns={{
          numberRangeFilter,
        }}
        paginated
        defaultPageSize={10}
      />
    );
  },
};

export const CombinedFilters: Story = {
  args: {},
  render: () => {
    const filters: ColumnFilter[] = [
      {
        id: "description",
        type: "text",
        label: "Merchant",
        placeholder: "Search merchant...",
      },
      {
        id: "date",
        type: "daterange",
        label: "Date Range",
      },
      {
        id: "amount",
        type: "numberrange",
        label: "Amount Range",
      },
      {
        id: "category",
        type: "multiselect",
        label: "Categories",
        placeholder: "Select categories...",
        options: [
          { label: "Food", value: "Food" },
          { label: "Shopping", value: "Shopping" },
          { label: "Entertainment", value: "Entertainment" },
          { label: "Transport", value: "Transport" },
          { label: "Bills", value: "Bills" },
        ],
      },
      {
        id: "account",
        type: "multiselect",
        label: "Accounts",
        placeholder: "Select accounts...",
        options: [
          { label: "Checking", value: "Checking" },
          { label: "Savings", value: "Savings" },
          { label: "Credit Card", value: "Credit Card" },
        ],
      },
      {
        id: "status",
        type: "select",
        label: "Status",
        options: [
          { label: "All", value: "" },
          { label: "Pending", value: "pending" },
          { label: "Completed", value: "completed" },
          { label: "Failed", value: "failed" },
        ],
      },
    ];

    return (
      <DataTable
        columns={transactionColumns}
        data={sampleTransactions}
        filters={filters}
        filterFns={{
          dateRangeFilter,
          numberRangeFilter,
          multiSelectFilter,
        }}
        searchable
        searchColumn="description"
        columnVisibility
        paginated
        defaultPageSize={20}
      />
    );
  },
};

export const FiltersWithSearch: Story = {
  args: {},
  render: () => {
    const filters: ColumnFilter[] = [
      {
        id: "category",
        type: "multiselect",
        label: "Categories",
        options: [
          { label: "Food", value: "Food" },
          { label: "Shopping", value: "Shopping" },
          { label: "Entertainment", value: "Entertainment" },
          { label: "Transport", value: "Transport" },
          { label: "Bills", value: "Bills" },
        ],
      },
      {
        id: "status",
        type: "select",
        label: "Status",
        options: [
          { label: "All", value: "" },
          { label: "Pending", value: "pending" },
          { label: "Completed", value: "completed" },
          { label: "Failed", value: "failed" },
        ],
      },
    ];

    return (
      <DataTable
        columns={transactionColumns}
        data={sampleTransactions}
        filters={filters}
        filterFns={{
          multiSelectFilter,
        }}
        searchable
        searchColumn="description"
        searchPlaceholder="Search by merchant..."
        paginated
        defaultPageSize={15}
      />
    );
  },
};
