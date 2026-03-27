/**
 * WarrantiesPage — warranty tracking dashboard for inventory items.
 *
 * Sections: expiring soon (90 days), active, expired warranties.
 * Color-coded urgency for expiring items. PRD-023/US-2.
 */
import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router";
import { ShieldCheck, ChevronDown, ChevronRight, AlertCircle } from "lucide-react";
import { Skeleton, AssetIdBadge, Badge } from "@pops/ui";
import { trpc } from "../lib/trpc";

interface WarrantyItem {
  id: string;
  itemName: string;
  assetId: string | null;
  warrantyExpires: string | null;
  replacementValue: number | null;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyBadgeVariant(days: number): "destructive" | "secondary" | "outline" {
  if (days <= 14) return "destructive";
  if (days <= 30) return "secondary";
  return "outline";
}

function WarrantySkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-6 w-48" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

interface WarrantyRowProps {
  item: WarrantyItem;
  daysRemaining: number;
  showUrgency?: boolean;
  onClick: () => void;
}

function WarrantyRow({ item, daysRemaining, showUrgency, onClick }: WarrantyRowProps) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
      onClick={onClick}
    >
      <span className="font-medium truncate flex-1">{item.itemName}</span>
      {item.assetId && <AssetIdBadge assetId={item.assetId} />}
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {item.warrantyExpires && formatDate(item.warrantyExpires)}
      </span>
      {showUrgency && (
        <Badge variant={urgencyBadgeVariant(daysRemaining)} className="text-xs whitespace-nowrap">
          {daysRemaining === 0 ? "Today" : daysRemaining === 1 ? "1 day" : `${daysRemaining} days`}
        </Badge>
      )}
      {!showUrgency && daysRemaining < 0 && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {Math.abs(daysRemaining)}d ago
        </span>
      )}
      {item.replacementValue != null && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatCurrency(item.replacementValue)}
        </span>
      )}
    </button>
  );
}

interface CollapsibleSectionProps {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left font-medium transition-colors hover:bg-muted/30"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        {title}
        <Badge variant="secondary" className="text-xs ml-1">
          {count}
        </Badge>
      </button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}

export function WarrantiesPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = trpc.inventory.reports.warranties.useQuery();

  const { expiringSoon, expired, active } = useMemo(() => {
    const items = data?.data ?? [];
    const expiringSoon: Array<WarrantyItem & { daysRemaining: number }> = [];
    const expired: Array<WarrantyItem & { daysRemaining: number }> = [];
    const active: Array<WarrantyItem & { daysRemaining: number }> = [];

    for (const item of items) {
      if (!item.warrantyExpires) continue;
      const days = daysUntil(item.warrantyExpires);
      const entry = { ...item, daysRemaining: days };

      if (days < 0) {
        expired.push(entry);
      } else if (days <= 90) {
        expiringSoon.push(entry);
      } else {
        active.push(entry);
      }
    }

    // Expiring soon: soonest first
    expiringSoon.sort((a, b) => a.daysRemaining - b.daysRemaining);
    // Expired: most recently expired first
    expired.sort((a, b) => b.daysRemaining - a.daysRemaining);
    // Active: soonest expiry first
    active.sort((a, b) => a.daysRemaining - b.daysRemaining);

    return { expiringSoon, expired, active };
  }, [data]);

  const totalItems = expiringSoon.length + expired.length + active.length;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-app-accent/10">
          <ShieldCheck className="h-6 w-6 text-app-accent" />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Warranty Tracking</h1>
      </div>

      {isLoading ? (
        <WarrantySkeleton />
      ) : isError ? (
        <div className="text-center py-16">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground mb-4">Could not load warranties — try again</p>
          <button
            type="button"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={() => refetch()}
          >
            Retry
          </button>
        </div>
      ) : totalItems === 0 ? (
        <div className="text-center py-16">
          <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground mb-4">
            No items with warranty dates. Add warranty expiry dates to your inventory items to track
            them here.
          </p>
          <Link
            to="/inventory/items"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Browse Items
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Expiring Soon — always open */}
          {expiringSoon.length > 0 && (
            <div className="border-2 border-app-accent/20 rounded-2xl bg-app-accent/5 overflow-hidden shadow-sm shadow-app-accent/5">
              <div className="flex items-center gap-2 px-5 py-4 font-bold text-foreground bg-app-accent/10">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-app-accent animate-pulse" />
                  Expiring Soon
                </span>
                <Badge className="bg-app-accent/20 text-app-accent border-app-accent/30 ml-auto">
                  {expiringSoon.length}
                </Badge>
              </div>
              <div className="px-3 pb-3">
                {expiringSoon.map((item) => (
                  <WarrantyRow
                    key={item.id}
                    item={item}
                    daysRemaining={item.daysRemaining}
                    showUrgency
                    onClick={() => navigate(`/inventory/items/${item.id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Active — collapsible */}
          {active.length > 0 && (
            <CollapsibleSection title="Active" count={active.length} defaultOpen>
              {active.map((item) => (
                <WarrantyRow
                  key={item.id}
                  item={item}
                  daysRemaining={item.daysRemaining}
                  onClick={() => navigate(`/inventory/items/${item.id}`)}
                />
              ))}
            </CollapsibleSection>
          )}

          {/* Expired — collapsible */}
          {expired.length > 0 && (
            <CollapsibleSection
              title="Expired"
              count={expired.length}
              defaultOpen={expiringSoon.length === 0 && active.length === 0}
            >
              {expired.map((item) => (
                <WarrantyRow
                  key={item.id}
                  item={item}
                  daysRemaining={item.daysRemaining}
                  onClick={() => navigate(`/inventory/items/${item.id}`)}
                />
              ))}
            </CollapsibleSection>
          )}
        </div>
      )}
    </div>
  );
}
