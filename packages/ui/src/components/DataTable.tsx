/**
 * DataTable component - Comprehensive table with sorting, filtering, pagination, and editing
 * Built on TanStack Table and shadcn primitives
 */
import { useState, useMemo } from "react";
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  Table as TanStackTable,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronDown, Search } from "lucide-react";
import { cn } from "../lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../primitives/table";
import { Button } from "./Button";
import { TextInput } from "./TextInput";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "../primitives/dropdown-menu";
import { FilterBar, type ColumnFilter } from "./DataTableFilters";

export interface DataTableProps<TData, TValue = unknown> {
  /**
   * Column definitions
   */
  columns: ColumnDef<TData, TValue>[];
  /**
   * Table data
   */
  data: TData[];
  /**
   * Enable search functionality
   */
  searchable?: boolean;
  /**
   * Search placeholder text
   */
  searchPlaceholder?: string;
  /**
   * Column to search (if searchable)
   */
  searchColumn?: string;
  /**
   * Enable pagination
   */
  paginated?: boolean;
  /**
   * Page size options
   */
  pageSizeOptions?: number[];
  /**
   * Default page size
   */
  defaultPageSize?: number;
  /**
   * Enable column visibility toggle
   */
  columnVisibility?: boolean;
  /**
   * Custom empty state
   */
  emptyState?: React.ReactNode;
  /**
   * Loading state
   */
  loading?: boolean;
  /**
   * Table className
   */
  className?: string;
  /**
   * Callback when row is clicked
   */
  onRowClick?: (row: TData) => void;
  /**
   * Enable row selection
   */
  enableRowSelection?: boolean;
  /**
   * Callback when selection changes
   */
  onSelectionChange?: (selectedRows: TData[]) => void;
  /**
   * Column filters configuration
   */
  filters?: ColumnFilter[];
  /**
   * Custom filter functions
   */
  filterFns?: Record<
    string,
    <TData>(row: TData, columnId: string, filterValue: unknown) => boolean
  >;
}

/**
 * DataTable component
 *
 * @example
 * ```tsx
 * const columns: ColumnDef<User>[] = [
 *   {
 *     accessorKey: "name",
 *     header: "Name",
 *   },
 *   {
 *     accessorKey: "email",
 *     header: "Email",
 *   },
 * ];
 *
 * <DataTable
 *   columns={columns}
 *   data={users}
 *   searchable
 *   searchColumn="name"
 *   paginated
 * />
 * ```
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  searchable = false,
  searchPlaceholder = "Search...",
  searchColumn,
  paginated = true,
  pageSizeOptions = [10, 20, 50, 100],
  defaultPageSize = 10,
  columnVisibility = true,
  emptyState,
  loading = false,
  className,
  onRowClick,
  enableRowSelection = false,
  onSelectionChange,
  filters,
  filterFns,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibilityState, setColumnVisibilityState] =
    useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: paginated ? getPaginationRowModel() : undefined,
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibilityState,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility: columnVisibilityState,
      rowSelection,
    },
    initialState: {
      pagination: {
        pageSize: defaultPageSize,
      },
    },
    enableRowSelection,
    filterFns,
  });

  // Notify parent of selection changes
  useMemo(() => {
    if (onSelectionChange && enableRowSelection) {
      const selectedRows = table
        .getFilteredSelectedRowModel()
        .rows.map((row) => row.original);
      onSelectionChange(selectedRows);
    }
  }, [rowSelection, onSelectionChange, enableRowSelection, table]);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Filters */}
      {filters && filters.length > 0 && (
        <FilterBar
          filters={filters}
          table={table as unknown as TanStackTable<unknown>}
        />
      )}

      {/* Toolbar */}
      {(searchable || columnVisibility) && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {searchable && searchColumn && (
            <TextInput
              placeholder={searchPlaceholder}
              prefix={<Search className="h-4 w-4" />}
              value={
                (table.getColumn(searchColumn)?.getFilterValue() as string) ??
                ""
              }
              onChange={(e) =>
                table.getColumn(searchColumn)?.setFilterValue(e.target.value)
              }
              className="w-full sm:max-w-sm"
              clearable
              onClear={() => table.getColumn(searchColumn)?.setFilterValue("")}
            />
          )}
          {columnVisibility && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Columns <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => {
                    return (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) =>
                          column.toggleVisibility(!!value)
                        }
                      >
                        {column.id}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  Loading...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(onRowClick && "cursor-pointer")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {emptyState || "No results."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {paginated && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {enableRowSelection && (
              <>
                {table.getFilteredSelectedRowModel().rows.length} of{" "}
                {table.getFilteredRowModel().rows.length} row(s) selected.
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2">
              <p className="hidden text-sm font-medium sm:block">
                Rows per page
              </p>
              <select
                value={table.getState().pagination.pageSize}
                onChange={(e) => {
                  table.setPageSize(Number(e.target.value));
                }}
                className="h-10 w-18 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {pageSizeOptions.map((pageSize) => (
                  <option key={pageSize} value={pageSize}>
                    {pageSize}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">
                Page {table.getState().pagination.pageIndex + 1} of{" "}
                {table.getPageCount()}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Helper to create a sortable column header
 */
export function SortableHeader({
  column,
  children,
}: {
  column: {
    toggleSorting: (desc?: boolean) => void;
    getIsSorted: () => false | "asc" | "desc";
  };
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      className="-ml-3 h-8 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
    >
      {children}
      <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
    </Button>
  );
}
