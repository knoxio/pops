import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

import { Checkbox } from '../primitives/checkbox';
import { Button } from './Button';
import { DataTable, SortableHeader } from './DataTable';
import { EditableCell } from './EditableCell';

const meta: Meta<typeof DataTable> = {
  title: 'Data Display/Table',
  component: DataTable,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Sample data types
interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  account: string;
}

// Sample data
const sampleUsers: User[] = [
  {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    role: 'Admin',
    status: 'active',
    createdAt: '2024-01-15',
  },
  {
    id: 2,
    name: 'Jane Smith',
    email: 'jane@example.com',
    role: 'User',
    status: 'active',
    createdAt: '2024-02-20',
  },
  {
    id: 3,
    name: 'Bob Johnson',
    email: 'bob@example.com',
    role: 'User',
    status: 'inactive',
    createdAt: '2024-03-10',
  },
  {
    id: 4,
    name: 'Alice Brown',
    email: 'alice@example.com',
    role: 'Moderator',
    status: 'active',
    createdAt: '2024-01-25',
  },
  {
    id: 5,
    name: 'Charlie Wilson',
    email: 'charlie@example.com',
    role: 'User',
    status: 'active',
    createdAt: '2024-04-05',
  },
];

const sampleTransactions: Transaction[] = Array.from({ length: 50 }, (_, i) => ({
  id: `txn-${i + 1}`,
  date: new Date(2024, 0, i + 1).toISOString().split('T')[0]!,
  description: ['Woolworths', 'Coles', 'Amazon', 'Netflix', 'Uber', 'Spotify'][i % 6]!,
  amount: Math.random() * 200 - 100,
  category: ['Food', 'Shopping', 'Entertainment', 'Transport'][i % 4]!,
  account: ['Checking', 'Savings', 'Credit Card'][i % 3]!,
}));

// Basic columns
const userColumns: ColumnDef<User>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
  },
  {
    accessorKey: 'email',
    header: ({ column }) => <SortableHeader column={column}>Email</SortableHeader>,
  },
  {
    accessorKey: 'role',
    header: 'Role',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      return (
        <span className={status === 'active' ? 'text-green-600' : 'text-muted-foreground'}>
          {status}
        </span>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => <SortableHeader column={column}>Created</SortableHeader>,
  },
];

export const Basic: Story = {
  args: {},
  render: () => {
    return <DataTable columns={userColumns} data={sampleUsers} />;
  },
};

export const WithSearch: Story = {
  args: {},
  render: () => {
    return (
      <DataTable
        columns={userColumns}
        data={sampleUsers}
        searchable
        searchColumn="name"
        searchPlaceholder="Search by name..."
      />
    );
  },
};

export const WithPagination: Story = {
  args: {},
  render: () => {
    const transactionColumns: ColumnDef<Transaction>[] = [
      {
        accessorKey: 'date',
        header: ({ column }) => <SortableHeader column={column}>Date</SortableHeader>,
      },
      {
        accessorKey: 'description',
        header: 'Description',
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => <SortableHeader column={column}>Amount</SortableHeader>,
        cell: ({ row }) => {
          const amount = row.getValue('amount') as number;
          const formatted = new Intl.NumberFormat('en-AU', {
            style: 'currency',
            currency: 'AUD',
          }).format(amount);
          return (
            <span className={amount < 0 ? 'text-red-600' : 'text-green-600'}>{formatted}</span>
          );
        },
      },
      {
        accessorKey: 'category',
        header: 'Category',
      },
      {
        accessorKey: 'account',
        header: 'Account',
      },
    ];

    return (
      <DataTable
        columns={transactionColumns}
        data={sampleTransactions}
        searchable
        searchColumn="description"
        paginated
        defaultPageSize={10}
        pageSizeOptions={[5, 10, 20, 50]}
      />
    );
  },
};

export const WithRowSelection: Story = {
  args: {},
  render: () => {
    const [selectedUsers, setSelectedUsers] = useState<User[]>([]);

    const selectableColumns: ColumnDef<User>[] = [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      ...userColumns,
    ];

    return (
      <div className="space-y-4">
        <DataTable
          columns={selectableColumns}
          data={sampleUsers}
          enableRowSelection
          onSelectionChange={setSelectedUsers}
          searchable
          searchColumn="name"
        />
        {selectedUsers.length > 0 && (
          <div className="text-sm">Selected: {selectedUsers.map((u) => u.name).join(', ')}</div>
        )}
      </div>
    );
  },
};

export const WithEditableCells: Story = {
  args: {},
  render: () => {
    const [users, setUsers] = useState(sampleUsers);

    const updateUser = (id: number, field: keyof User, value: User[keyof User]) => {
      setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, [field]: value } : user)));
    };

    const editableColumns: ColumnDef<User>[] = [
      {
        accessorKey: 'name',
        header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
        cell: ({ row }) => (
          <EditableCell
            value={row.original.name}
            type="text"
            onSave={(newValue) => updateUser(row.original.id, 'name', newValue)}
            validate={(val) => val.length >= 2 || 'Name must be at least 2 characters'}
          />
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => (
          <EditableCell
            value={row.original.email}
            type="text"
            onSave={(newValue) => updateUser(row.original.id, 'email', newValue)}
            validate={(val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) || 'Invalid email'}
          />
        ),
      },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => (
          <EditableCell
            value={row.original.role}
            type="select"
            options={[
              { label: 'Admin', value: 'Admin' },
              { label: 'Moderator', value: 'Moderator' },
              { label: 'User', value: 'User' },
            ]}
            onSave={(newValue) => updateUser(row.original.id, 'role', newValue)}
          />
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <EditableCell
            value={row.original.status}
            type="select"
            options={[
              { label: 'Active', value: 'active' },
              { label: 'Inactive', value: 'inactive' },
            ]}
            onSave={(newValue) => updateUser(row.original.id, 'status', newValue)}
          />
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
      },
    ];

    return <DataTable columns={editableColumns} data={users} searchable searchColumn="name" />;
  },
};

export const WithActions: Story = {
  args: {},
  render: () => {
    const handleEdit = (user: User) => {
      alert(`Edit user: ${user.name}`);
    };

    const handleDelete = (user: User) => {
      alert(`Delete user: ${user.name}`);
    };

    const columnsWithActions: ColumnDef<User>[] = [
      ...userColumns,
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => handleEdit(row.original)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleDelete(row.original)}>
              Delete
            </Button>
          </div>
        ),
      },
    ];

    return (
      <DataTable
        columns={columnsWithActions}
        data={sampleUsers}
        onRowClick={(user) => console.log('Clicked row:', user)}
      />
    );
  },
};

export const Loading: Story = {
  args: {},
  render: () => {
    return <DataTable columns={userColumns} data={[]} loading />;
  },
};

export const EmptyState: Story = {
  args: {},
  render: () => {
    return (
      <DataTable
        columns={userColumns}
        data={[]}
        emptyState={
          <div className="flex flex-col items-center gap-2">
            <p className="text-lg font-medium">No users found</p>
            <p className="text-sm text-muted-foreground">Get started by adding your first user</p>
            <Button size="sm" className="mt-2">
              Add User
            </Button>
          </div>
        }
      />
    );
  },
};
