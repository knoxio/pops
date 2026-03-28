/**
 * WarrantiesPage — warranty tracking dashboard for inventory items.
 *
 * 5-tier system: <30d (red), 30-60d (yellow), 60-90d (orange),
 * >90d active (green), expired (grey). PRD-050/US-01.
 */
import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router";
import { ShieldCheck, ChevronDown, ChevronRight, AlertCircle } from "lucide-react";
import { Skeleton, AssetIdBadge, Badge, PageHeader } from "@pops/ui";
import { trpc } from "../lib/trpc";

interface WarrantyItem {
  id: string;
  itemName: string;
  assetId: string | null;
  brand: string | null;
  model: string | null;
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

function formatDaysRemaining(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function brandModelLabel(brand: string | null, model: string | null): string | null {
  if (brand && model) return `${brand} ${model}`;
  return brand ?? model ?? null;
}

function WarrantyRow({ item, daysRemaining, showUrgency, onClick }: WarrantyRowProps) {
  const subtitle = brandModelLabel(item.brand, item.model);

  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
      onClick={onClick}
    >
      <div className="flex flex-col min-w-0 flex-1">
        <span className="font-medium truncate">{item.itemName}</span>
        {subtitle && <span className="text-xs text-muted-foreground truncate">{subtitle}</span>}
      </div>
      {item.assetId && <AssetIdBadge assetId={item.assetId} />}
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {item.warrantyExpires && formatDate(item.warrantyExpires)}
      </span>
      {showUrgency && (
        <Badge variant={urgencyBadgeVariant(daysRemaining)} className="text-xs whitespace-nowrap">
          {formatDaysRemaining(daysRemaining)}
        </Badge>
      )}
      {!showUrgency && daysRemaining >= 0 && (
        <Badge
          variant="outline"
          className="text-xs whitespace-nowrap text-green-600 border-green-200"
        >
          {formatDaysRemaining(daysRemaining)}
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

interface TierConfig {
  label: string;
  borderColor: string;
  bgColor: string;
  headerBg: string;
  dotColor: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}

const TIER_STYLES: Record<string, TierConfig> = {
  critical: {
    label: "Critical — Under 30 Days",
    borderColor: "border-red-500/20",
    bgColor: "bg-red-500/5",
    headerBg: "bg-red-500/10",
    dotColor: "bg-red-500",
    badgeBg: "bg-red-500/20",
    badgeText: "text-red-600 dark:text-red-400",
    badgeBorder: "border-red-500/30",
  },
  warning: {
    label: "Warning — 30 to 60 Days",
    borderColor: "border-yellow-500/20",
    bgColor: "bg-yellow-500/5",
    headerBg: "bg-yellow-500/10",
    dotColor: "bg-yellow-500",
    badgeBg: "bg-yellow-500/20",
    badgeText: "text-yellow-600 dark:text-yellow-400",
    badgeBorder: "border-yellow-500/30",
  },
  caution: {
    label: "Caution — 60 to 90 Days",
    borderColor: "border-orange-500/20",
    bgColor: "bg-orange-500/5",
    headerBg: "bg-orange-500/10",
    dotColor: "bg-orange-500",
    badgeBg: "bg-orange-500/20",
    badgeText: "text-orange-600 dark:text-orange-400",
    badgeBorder: "border-orange-500/30",
  },
};

interface ExpiringSectionProps {
  tier: keyof typeof TIER_STYLES;
  items: Array<WarrantyItem & { daysRemaining: number }>;
  onItemClick: (id: string) => void;
}

function ExpiringSection({ tier, items, onItemClick }: ExpiringSectionProps) {
  if (items.length === 0) return null;
  const style = TIER_STYLES[tier]!;

  return (
    <div className={`border-2 ${style.borderColor} rounded-2xl ${style.bgColor} overflow-hidden shadow-sm`}>
      <div className={`flex items-center gap-2 px-5 py-4 font-bold text-foreground ${style.headerBg}`}>
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${style.dotColor} animate-pulse`} />
          {style.label}
        </span>
        <Badge className={`${style.badgeBg} ${style.badgeText} ${style.badgeBorder} ml-auto`}>
          {items.length}
        </Badge>
      </div>
      <div className="px-3 pb-3">
        {items.map((item) => (
          <WarrantyRow
            key={item.id}
            item={item}
            daysRemaining={item.daysRemaining}
            showUrgency
            onClick={() => onItemClick(item.id)}
          />
        ))}
      </div>
    </div>
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

  const { critical, warning, caution, active, expired } = useMemo(() => {
    type Entry = WarrantyItem & { daysRemaining: number };
    const items = data?.data ?? [];
    const critical: Entry[] = []; // <30d — red
    const warning: Entry[] = []; // 30-60d — yellow/orange
    const caution: Entry[] = []; // 60-90d — orange
    const active: Entry[] = []; // >90d — green
    const expired: Entry[] = []; // <0d — grey

    for (const item of items) {
      if (!item.warrantyExpires) continue;
      const days = daysUntil(item.warrantyExpires);
      const entry = { ...item, daysRemaining: days };

      if (days < 0) expired.push(entry);
      else if (days < 30) critical.push(entry);
      else if (days < 60) warning.push(entry);
      else if (days <= 90) caution.push(entry);
      else active.push(entry);
    }

    // Sort each tier: soonest first (expired: most recently expired first)
    critical.sort((a, b) => a.daysRemaining - b.daysRemaining);
    warning.sort((a, b) => a.daysRemaining - b.daysRemaining);
    caution.sort((a, b) => a.daysRemaining - b.daysRemaining);
    active.sort((a, b) => a.daysRemaining - b.daysRemaining);
    expired.sort((a, b) => b.daysRemaining - a.daysRemaining);

    return { critical, warning, caution, active, expired };
  }, [data]);

  const totalItems = critical.length + warning.length + caution.length + active.length + expired.length;
  const hasExpiringItems = critical.length + warning.length + caution.length > 0;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Warranty Tracking"
        icon={
          <div className="p-2 rounded-xl bg-app-accent/10">
            <ShieldCheck className="h-6 w-6 text-app-accent" />
          </div>
        }
      />

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
          {/* Expiring tiers — always expanded, not collapsible */}
          <ExpiringSection tier="critical" items={critical} onItemClick={(id) => navigate(`/inventory/items/${id}`)} />
          <ExpiringSection tier="warning" items={warning} onItemClick={(id) => navigate(`/inventory/items/${id}`)} />
          <ExpiringSection tier="caution" items={caution} onItemClick={(id) => navigate(`/inventory/items/${id}`)} />

          {/* Active — collapsible, expanded by default */}
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

          {/* Expired — collapsible, collapsed by default */}
          {expired.length > 0 && (
            <CollapsibleSection
              title="Expired"
              count={expired.length}
              defaultOpen={!hasExpiringItems && active.length === 0}
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
