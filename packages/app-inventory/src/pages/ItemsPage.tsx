/**
 * ItemsPage — inventory item list with search, filters, table/grid toggle,
 * and summary statistics. PRD-019/US-2.
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { Package, LayoutGrid, LayoutList, Search, DollarSign, Shield, Clock } from "lucide-react";
import {
  Skeleton,
  Select,
  type SelectOption,
  Button,
  TextInput,
  Card,
  CardContent,
  TypeBadge,
  ViewToggleGroup,
} from "@pops/ui";
import type { Condition } from "@pops/ui";
import { trpc } from "../lib/trpc";
import { InventoryTable } from "../components/InventoryTable";
import { InventoryCard } from "../components/InventoryCard";
import { ValueByTypeCard } from "../components/ValueBreakdown";
import { formatCurrency } from "../lib/utils";
type ViewMode = "table" | "grid";

const VIEW_STORAGE_KEY = "inventory-view-mode";

const VIEW_OPTIONS = [
  { value: "table" as const, label: "Table view", icon: <LayoutList className="h-4 w-4" /> },
  { value: "grid" as const, label: "Grid view", icon: <LayoutGrid className="h-4 w-4" /> },
];

function getInitialView(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
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

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function DashboardWidgets() {
  const navigate = useNavigate();
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
          <div className="text-2xl font-bold tabular-nums">{formatCurrency(totalResaleValue)}</div>
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
            <span className="text-sm font-normal text-muted-foreground ml-1">expiring</span>
          </div>
        </CardContent>
      </Card>

      {recentlyAdded.length > 0 && (
        <Card className="col-span-2">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-3">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium">Recently Added</span>
            </div>
            <ul className="space-y-1.5">
              {recentlyAdded.map((item) => (
                <li
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className="flex items-center gap-2 text-sm rounded-md px-2 py-1.5 -mx-2 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/inventory/items/${item.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/inventory/items/${item.id}`);
                    }
                  }}
                >
                  <span className="font-medium truncate">{item.itemName}</span>
                  {item.type && <TypeBadge type={item.type} />}
                  {item.assetId && (
                    <span className="text-xs text-muted-foreground shrink-0">{item.assetId}</span>
                  )}
                  <span className="text-xs text-muted-foreground shrink-0 ml-auto">
                    {timeAgo(item.lastEditedTime)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ValueByTypeCard className="col-span-2" />
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
    [search, typeFilter, conditionFilter, inUseFilter]
  );

  const { data, isLoading } = trpc.inventory.items.list.useQuery(queryInput);

  const items = data?.data ?? [];
  const totalCount = data?.pagination?.total ?? 0;
  const totalReplacementValue = data?.totals?.totalReplacementValue ?? 0;
  const totalResaleValue = data?.totals?.totalResaleValue ?? 0;

  const handleViewChange = (mode: ViewMode) => setViewMode(mode);

  const hasActiveFilters = !!(typeFilter || conditionFilter || inUseFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">Inventory</h1>
      </div>

      {!hasActiveFilters && !search && <DashboardWidgets />}

      {/* Search + Filters + View Toggle */}
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

      {/* Summary line + View Toggle */}
      {!isLoading && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1.5">
            <Package className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
              {totalCount} {totalCount === 1 ? "item" : "items"}
              {totalReplacementValue > 0 && (
                <span> — {formatCurrency(totalReplacementValue)} replacement</span>
              )}
              {totalResaleValue > 0 && <span> — {formatCurrency(totalResaleValue)} resale</span>}
            </p>
          </div>
          <ViewToggleGroup
            options={VIEW_OPTIONS}
            value={viewMode}
            onChange={handleViewChange}
            storageKey={VIEW_STORAGE_KEY}
            className="ml-auto"
          />
        </div>
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
              onClick={() => navigate(`/inventory/items/${item.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
