import { useSearchParams } from "react-router";
import { Badge, Button, Skeleton } from "@pops/ui";
import { trpc } from "../lib/trpc";

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function WarrantyBadge({ status }: { status: "active" | "expired" | "none" }) {
  if (status === "active") {
    return <Badge variant="default" className="bg-green-600 text-xs">Active</Badge>;
  }
  if (status === "expired") {
    return <Badge variant="destructive" className="text-xs">Expired</Badge>;
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

function ReportSkeleton() {
  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-48" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function InsuranceReportPage() {
  const [searchParams] = useSearchParams();
  const locationId = searchParams.get("locationId") ?? undefined;

  const { data, isLoading, error } = trpc.inventory.reports.insuranceReport.useQuery(
    locationId ? { locationId } : undefined,
  );

  if (isLoading) return <ReportSkeleton />;

  if (error) {
    return (
      <div className="p-6">
        <p className="text-destructive">Failed to load report: {error.message}</p>
      </div>
    );
  }

  const report = data?.data;
  if (!report) return null;

  const generatedAt = new Date().toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="p-6 max-w-5xl print:p-0 print:max-w-none">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 print:mb-4">
        <div>
          <h1 className="text-2xl font-bold print:text-xl">Insurance Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generated {generatedAt} · {report.totals.itemCount} item{report.totals.itemCount !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          className="print:hidden"
        >
          Print Report
        </Button>
      </div>

      {/* Summary totals */}
      <div className="grid grid-cols-3 gap-4 mb-8 print:mb-4 print:gap-2">
        <SummaryCard label="Items" value={String(report.totals.itemCount)} />
        <SummaryCard label="Replacement Value" value={formatCurrency(report.totals.replacementValue)} />
        <SummaryCard label="Resale Value" value={formatCurrency(report.totals.resaleValue)} />
      </div>

      {/* Location groups */}
      {report.locations.length === 0 ? (
        <p className="text-muted-foreground">No items found.</p>
      ) : (
        <div className="space-y-8 print:space-y-4">
          {report.locations.map((group) => (
            <section key={group.locationId ?? "__unassigned"} className="break-inside-avoid">
              <div className="flex items-baseline justify-between border-b pb-2 mb-3 print:mb-2">
                <h2 className="text-lg font-semibold print:text-base">{group.locationName}</h2>
                <span className="text-sm text-muted-foreground">
                  {group.items.length} item{group.items.length !== 1 ? "s" : ""} ·{" "}
                  {formatCurrency(group.totalReplacementValue)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-2 font-medium print:hidden w-12"></th>
                      <th className="pb-2 pr-3 font-medium">Name</th>
                      <th className="pb-2 pr-3 font-medium hidden sm:table-cell">Asset ID</th>
                      <th className="pb-2 pr-3 font-medium hidden md:table-cell">Brand</th>
                      <th className="pb-2 pr-3 font-medium">Condition</th>
                      <th className="pb-2 pr-3 font-medium">Warranty</th>
                      <th className="pb-2 pr-3 font-medium text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.id} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-2 print:hidden">
                          {item.photoPath ? (
                            <img
                              src={`/inventory/photos/${item.photoPath}`}
                              alt=""
                              className="w-10 h-10 rounded object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded bg-muted" />
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-medium">{item.itemName}</div>
                          {item.model && (
                            <div className="text-xs text-muted-foreground">{item.model}</div>
                          )}
                        </td>
                        <td className="py-2 pr-3 hidden sm:table-cell text-muted-foreground">
                          {item.assetId ?? "—"}
                        </td>
                        <td className="py-2 pr-3 hidden md:table-cell text-muted-foreground">
                          {item.brand ?? "—"}
                        </td>
                        <td className="py-2 pr-3">{item.condition ?? "—"}</td>
                        <td className="py-2 pr-3">
                          <WarrantyBadge status={item.warrantyStatus} />
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatCurrency(item.replacementValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Print footer */}
      <div className="hidden print:block mt-8 pt-4 border-t text-xs text-muted-foreground">
        <p>POPS Insurance Report · Generated {generatedAt}</p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4 print:p-2">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-1 print:text-base">{value}</div>
    </div>
  );
}
