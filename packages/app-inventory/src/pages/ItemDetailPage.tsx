/**
 * Item detail page — full view of a single inventory item.
 * Shows header with badges, photo placeholder, metadata grid,
 * notes section, and connections list.
 */
import { useParams, useNavigate, Link } from "react-router";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  Skeleton,
  Badge,
  AssetIdBadge,
  ConditionBadge,
  TypeBadge,
  LocationBreadcrumb,
} from "@pops/ui";
import type { Condition, LocationSegment } from "@pops/ui";
import { Button } from "@pops/ui";
import { ArrowLeft, Pencil, Trash2, Package, Calendar, DollarSign, ShieldCheck, MapPin } from "lucide-react";
import { trpc } from "../lib/trpc";
import { ConnectionsList } from "../components/ConnectionsList";

function ItemDetailSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  );
}

function MetadataItem({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
          {label}
        </p>
        <div className="text-sm font-medium text-foreground">{children}</div>
      </div>
    </div>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;
}

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: itemResponse, isLoading, error } = trpc.inventory.items.get.useQuery(
    { id: id! },
    { enabled: !!id }
  );
  const item = itemResponse?.data;

  const { data: connectionsData } = trpc.inventory.connections.listForItem.useQuery(
    { itemId: id! },
    { enabled: !!id }
  );

  const { data: locationsResponse } = trpc.inventory.locations.tree.useQuery();
  const locationsTree = locationsResponse?.data;

  if (!id) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Invalid item</AlertTitle>
          <AlertDescription>No item ID provided.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) return <ItemDetailSkeleton />;

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Failed to load item</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>Item not found</AlertTitle>
          <AlertDescription>
            The item you&apos;re looking for doesn&apos;t exist.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Build location breadcrumb segments from tree
  const locationSegments: LocationSegment[] = [];
  if (item.locationId && locationsTree) {
    function findPath(
      nodes: { id: string; name: string; children: { id: string; name: string; children: unknown[] }[] }[],
      targetId: string,
    ): LocationSegment[] {
      for (const node of nodes) {
        if (node.id === targetId) return [{ id: node.id, name: node.name }];
        const childPath = findPath(
          node.children as typeof nodes,
          targetId,
        );
        if (childPath.length > 0) {
          return [{ id: node.id, name: node.name }, ...childPath];
        }
      }
      return [];
    }
    locationSegments.push(...findPath(locationsTree, item.locationId));
  }

  // Map connections to ConnectedItem shape
  const connections = (connectionsData?.data ?? []).map((conn) => ({
    id: conn.itemAId === id ? conn.itemBId : conn.itemAId,
    itemName: conn.itemAId === id ? conn.itemBId : conn.itemAId,
    assetId: null as string | null,
    type: null as string | null,
  }));

  const condition = item.condition as Condition | null;

  return (
    <div className="space-y-6">
      {/* Back + Actions */}
      <div className="flex items-center justify-between">
        <Link
          to="/inventory"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to inventory
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{item.itemName}</h1>
        {(item.brand || item.model) && (
          <p className="text-sm text-muted-foreground">
            {item.brand}
            {item.brand && item.model && " · "}
            {item.model}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {item.assetId && <AssetIdBadge assetId={item.assetId} />}
          {item.type && <TypeBadge type={item.type} />}
          {condition && <ConditionBadge condition={condition} />}
          {item.inUse && (
            <Badge variant="default" className="text-[10px] uppercase tracking-wider font-bold py-0 px-1.5 h-5 bg-emerald-600 hover:bg-emerald-600">
              In Use
            </Badge>
          )}
          {item.deductible && (
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-bold py-0 px-1.5 h-5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
              Deductible
            </Badge>
          )}
        </div>
      </div>

      {/* Photo placeholder */}
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Package className="h-10 w-10 opacity-40" />
          <p className="text-sm">Photos coming soon</p>
        </div>
      </div>

      {/* Metadata grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {locationSegments.length > 0 && (
          <MetadataItem icon={MapPin} label="Location">
            <LocationBreadcrumb
              segments={locationSegments}
              onNavigate={(seg) => navigate(`/inventory?location=${seg.id}`)}
            />
          </MetadataItem>
        )}
        {item.room && !item.locationId && (
          <MetadataItem icon={MapPin} label="Room">
            {item.room}
          </MetadataItem>
        )}
        <MetadataItem icon={Calendar} label="Purchased">
          {formatDate(item.purchaseDate)}
        </MetadataItem>
        <MetadataItem icon={ShieldCheck} label="Warranty Expires">
          {formatDate(item.warrantyExpires)}
        </MetadataItem>
        <MetadataItem icon={DollarSign} label="Replacement Value">
          {formatCurrency(item.replacementValue)}
        </MetadataItem>
        <MetadataItem icon={DollarSign} label="Resale Value">
          {formatCurrency(item.resaleValue)}
        </MetadataItem>
        {item.purchasedFromName && (
          <MetadataItem icon={Package} label="Purchased From">
            {item.purchasedFromName}
          </MetadataItem>
        )}
      </div>

      {/* Notes */}
      {item.notes && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Notes</h3>
          <div className="rounded-md border bg-muted/30 p-4 text-sm whitespace-pre-wrap">
            {item.notes}
          </div>
        </div>
      )}

      {/* Connections */}
      <ConnectionsList
        connections={connections}
        onItemClick={(itemId) => navigate(`/inventory/items/${itemId}`)}
      />
    </div>
  );
}
