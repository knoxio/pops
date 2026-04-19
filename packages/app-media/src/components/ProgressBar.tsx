import { cn, Progress } from '@pops/ui';

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
    <div className={cn('flex items-center gap-2', className)}>
      <Progress
        value={Math.min(percentage, 100)}
        className={cn(
          'flex-1 h-2',
          isComplete ? '[&>[data-slot=progress-indicator]]:!bg-success' : ''
        )}
      />
      {showLabel && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {watched}/{total}
        </span>
      )}
    </div>
  );
}
