import { formatAUD } from '@pops/ui';

interface ReportSummaryProps {
  totalItems: number;
  totalValue: number;
}

export function ReportSummary({ totalItems, totalValue }: ReportSummaryProps) {
  return (
    <div className="grid grid-cols-2 gap-6 mb-8 p-6 rounded-2xl bg-app-accent/10 border-2 border-app-accent/10 print:bg-transparent print:border print:border-gray-300 print:rounded-none">
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">
          Total Items
        </p>
        <p className="text-3xl font-black text-foreground">{totalItems}</p>
      </div>
      <div className="text-right">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">
          Total Replacement Value
        </p>
        <p className="text-3xl font-black text-app-accent dark:text-app-accent">
          {formatAUD(totalValue)}
        </p>
      </div>
    </div>
  );
}
