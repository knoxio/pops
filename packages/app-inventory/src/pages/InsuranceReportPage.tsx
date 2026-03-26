/**
 * InsuranceReportPage — print-friendly insurance report for inventory items.
 *
 * Shows items grouped by location with name, asset ID, brand, condition,
 * warranty status, value, and photo thumbnail. Summary totals at bottom.
 * PRD-023/US-4 (tb-133).
 */
import { useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { FileText, Printer } from "lucide-react";
import { Skeleton, AssetIdBadge, ConditionBadge, Badge, type Condition } from "@pops/ui";
import { trpc } from "../lib/trpc";

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

function warrantyStatus(expiryStr: string | null): {
  label: string;
  variant: "default" | "destructive" | "secondary";
} {
  if (!expiryStr) return { label: "None", variant: "secondary" };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryStr);
  const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: "Expired", variant: "destructive" };
  if (days <= 90) return { label: `${days}d left`, variant: "default" };
  return { label: formatDate(expiryStr), variant: "secondary" };
}

export function InsuranceReportPage(): React.ReactElement {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const locationId = searchParams.get("locationId") ?? undefined;

  const { data, isLoading } = trpc.inventory.reports.insuranceReport.useQuery(
    locationId ? { locationId } : undefined
  );

  const report = data?.data;

  const today = useMemo(() => {
    return new Date().toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, []);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Failed to load report.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto print:p-0 print:max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 print:mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-6 w-6 text-muted-foreground print:hidden" />
            <h1 className="text-2xl font-bold">Insurance Report</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Generated {today}
            {locationId && report.groups.length === 1 && <> — {report.groups[0].locationName}</>}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 transition-colors shadow-sm shadow-amber-500/20 print:hidden"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-6 mb-8 p-6 rounded-2xl bg-amber-500/10 border-2 border-amber-500/10 print:bg-transparent print:border print:border-gray-300 print:rounded-none">
        <div>
          <p className="text-xs font-bold text-amber-900/60 dark:text-amber-100/60 uppercase tracking-widest mb-1">
            Total Items
          </p>
          <p className="text-3xl font-black text-amber-900 dark:text-amber-50">
            {report.totalItems}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-amber-900/60 dark:text-amber-100/60 uppercase tracking-widest mb-1">
            Total Replacement Value
          </p>
          <p className="text-3xl font-black text-amber-600 dark:text-amber-400">
            {formatCurrency(report.totalValue)}
          </p>
        </div>
      </div>

      {/* Location Groups */}
      {report.groups.map((group) => (
        <div
          key={group.locationId ?? "unlocated"}
          className="mb-8 print:mb-4 print:break-inside-avoid-page"
        >
          <h2 className="text-lg font-semibold mb-3 pb-1 border-b">
            {group.locationName}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({group.items.length} {group.items.length === 1 ? "item" : "items"})
            </span>
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 w-10">Photo</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Asset ID</th>
                  <th className="py-2 pr-3">Brand</th>
                  <th className="py-2 pr-3">Condition</th>
                  <th className="py-2 pr-3">Warranty</th>
                  <th className="py-2 pr-3 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => {
                  const warranty = warrantyStatus(item.warrantyExpires);
                  return (
                    <tr
                      key={item.id}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer print:hover:bg-transparent print:cursor-default"
                      onClick={() => navigate(`/inventory/items/${item.id}`)}
                    >
                      <td className="py-2 pr-3">
                        {item.photoPath ? (
                          <img
                            src={`/inventory/photos/${item.photoPath}`}
                            alt=""
                            className="w-8 h-8 rounded object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-muted" />
                        )}
                      </td>
                      <td className="py-2 pr-3 font-medium">{item.itemName}</td>
                      <td className="py-2 pr-3">
                        {item.assetId ? (
                          <AssetIdBadge assetId={item.assetId} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">{item.brand ?? "—"}</td>
                      <td className="py-2 pr-3">
                        {item.condition ? (
                          <ConditionBadge condition={item.condition as Condition} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={warranty.variant}>{warranty.label}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {item.replacementValue ? formatCurrency(item.replacementValue) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {group.items.some((i) => i.replacementValue) && (
                <tfoot>
                  <tr className="font-semibold">
                    <td colSpan={6} className="py-2 pr-3 text-right">
                      Subtotal
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatCurrency(
                        group.items.reduce((sum, i) => sum + (i.replacementValue ?? 0), 0)
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ))}

      {report.groups.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No inventory items found.</p>
        </div>
      )}
    </div>
  );
}
