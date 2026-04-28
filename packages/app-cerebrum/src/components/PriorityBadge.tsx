/** Priority badge for nudge cards. */
export function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    high: 'bg-rose-500/10 text-rose-400',
    medium: 'bg-amber-500/10 text-amber-400',
    low: 'bg-sky-500/10 text-sky-400',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[priority] ?? ''}`}>{priority}</span>
  );
}
