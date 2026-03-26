import { cn } from "@pops/ui";

interface ProgressBarProps {
  watched: number;
  total: number;
  className?: string;
  showLabel?: boolean;
}

export function ProgressBar({ watched, total, className, showLabel = true }: ProgressBarProps) {
  if (total === 0) return null;

  const percentage = Math.round((watched / total) * 100);
  const isComplete = watched >= total;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isComplete ? "bg-green-500" : "bg-primary"
          )}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {watched}/{total}
        </span>
      )}
    </div>
  );
}
