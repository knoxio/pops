/**
 * ItemsPage — inventory item list with search, filters, table/grid toggle,
 * and summary statistics. PRD-019/US-2.
 */
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  Package,
  LayoutGrid,
  LayoutList,
  Search,
  DollarSign,
  Shield,
  Clock,
} from "lucide-react";
import {
  Skeleton,
  Select,
  type SelectOption,
  Button,
  TextInput,
  Card,
  CardContent,
} from "@pops/ui";
import type { Condition } from "@pops/ui";
import { trpc } from "../lib/trpc";
import { InventoryTable } from "../components/InventoryTable";
import { InventoryCard } from "../components/InventoryCard";
import { ValueBreakdown } from "../components/ValueBreakdown";
import { formatCurrency } from "../lib/utils";
type ViewMode = "table" | "grid";

const STORAGE_KEY = "inventory-view-mode";

function getInitialView(): ViewMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "grid" || stored === "table") return stored;
  } catch {
    // SSR or no localStorage
  }
  return "table";
}

const TYPE_OPTIONS: SelectOption[] = [
  { value: "", label: "All Types" },
  { value: "Electronics", label: "Electronics" },
  { value: "Furniture", label: "Furniture" },
  { value: "Appliance", label: "Appliance" },
  { value: "Clothing", label: "Clothing" },
  { value: "Tools", label: "Tools" },
  { value: "Sports", label: "Sports" },
  { value: "Other", label: "Other" },
];

const CONDITION_OPTIONS: SelectOption[] = [
  { value: "", label: "All Conditions" },
  { value: "Excellent", label: "Excellent" },
  { value: "Good", label: "Good" },
  { value: "Fair", label: "Fair" },
  { value: "Poor", label: "Poor" },
];

const IN_USE_OPTIONS: SelectOption[] = [
  { value: "", label: "All" },
  { value: "true", label: "In Use" },
  { value: "false", label: "Not In Use" },
];

function DashboardWidgets() {
  const { data, isLoading } = trpc.inventory.reports.dashboard.useQuery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data?.data) return null;

  const {
    itemCount,
    totalReplacementValue,
    totalResaleValue,
    warrantiesExpiringSoon,
    recentlyAdded,
  } = data.data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Package className="h-4 w-4" />
              <span className="text-xs font-medium">Items</span>
            </div>
            <div className="text-2xl font-bold tabular-nums">{itemCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs font-medium">Replacement</span>
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(totalReplacementValue)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs font-medium">Resale</span>
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(totalResaleValue)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Shield className="h-4 w-4" />
              <span className="text-xs font-medium">Warranties</span>
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {warrantiesExpiringSoon}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                expiring
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {recentlyAdded.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-3">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium">Recently Added</span>
            </div>
            <ul className="space-y-2">
              {recentlyAdded.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium truncate">{item.itemName}</span>
                  {item.type && (
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {item.type}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ItemsPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-28" />
      </div>
      <Skeleton className="h-4 w-48" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function ItemsPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialView);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [inUseFilter, setInUseFilter] = useState("");

  const queryInput = useMemo(
    () => ({
      search: search || undefined,
      type: typeFilter || undefined,
      condition: conditionFilter || undefined,
      inUse: (inUseFilter || undefined) as "true" | "false" | undefined,
      limit: 200,
    }),
    [search, typeFilter, conditionFilter, inUseFilter],
  );

  const { data, isLoading } = trpc.inventory.items.list.useQuery(queryInput);

  const items = data?.data ?? [];
  const totalCount = data?.pagination?.total ?? 0;
  const totalReplacementValue = data?.totals?.totalReplacementValue ?? 0;
  const totalResaleValue = data?.totals?.totalResaleValue ?? 0;

  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, []);

  const hasActiveFilters = !!(typeFilter || conditionFilter || inUseFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">Inventory</h1>
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => handleViewChange("table")}
            aria-label="Table view"
            aria-pressed={viewMode === "table"}
            className={`rounded-md p-1.5 transition-all ${
              viewMode === "table"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutList className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => handleViewChange("grid")}
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
            className={`rounded-md p-1.5 transition-all ${
              viewMode === "grid"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!hasActiveFilters && !search && (
        <>
          <DashboardWidgets />
          <ValueBreakdown />
        </>
      )}

      {/* Search + Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <TextInput
          placeholder="Search items or asset IDs..."
          prefix={<Search className="h-4 w-4" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          clearable
          onClear={() => setSearch("")}
          className="w-full sm:max-w-xs"
        />
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={TYPE_OPTIONS}
          placeholder="All Types"
          className="w-36"
        />
        <Select
          value={conditionFilter}
          onChange={(e) => setConditionFilter(e.target.value)}
          options={CONDITION_OPTIONS}
          placeholder="All Conditions"
          className="w-40"
        />
        <Select
          value={inUseFilter}
          onChange={(e) => setInUseFilter(e.target.value)}
          options={IN_USE_OPTIONS}
          placeholder="All"
          className="w-28"
        />
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTypeFilter("");
              setConditionFilter("");
              setInUseFilter("");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Summary line */}
      {!isLoading && (
        <p className="text-sm text-muted-foreground">
          {totalCount} {totalCount === 1 ? "item" : "items"}
          {totalReplacementValue > 0 && (
            <span> — {formatCurrency(totalReplacementValue)} replacement</span>
          )}
          {totalResaleValue > 0 && (
            <span> — {formatCurrency(totalResaleValue)} resale</span>
          )}
        </p>
      )}

      {/* Content */}
      {isLoading ? (
        <ItemsPageSkeleton />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
          <Package className="h-12 w-12 opacity-40" />
          <p>
            {search || hasActiveFilters
              ? "No items match your filters."
              : "No inventory items yet."}
          </p>
        </div>
      ) : viewMode === "table" ? (
        <InventoryTable items={items} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <InventoryCard
              key={item.id}
              id={item.id}
              itemName={item.itemName}
              brand={item.brand}
              model={item.model}
              assetId={item.assetId}
              type={item.type}
              condition={item.condition as Condition | null}
              onClick={() => navigate(`/inventory/${item.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
