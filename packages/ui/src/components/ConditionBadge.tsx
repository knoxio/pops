import type { ComponentProps } from "react";
import { Badge } from "../primitives/badge";
import { cn } from "../lib/utils";

export type Condition = "Excellent" | "Good" | "Fair" | "Poor";

const conditionStyles: Record<Condition, string> = {
  Excellent:
    "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400",
  Good: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400",
  Fair: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400",
  Poor: "bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-400",
};

export interface ConditionBadgeProps
  extends Omit<ComponentProps<typeof Badge>, "variant" | "children"> {
  condition: Condition;
}

export function ConditionBadge({
  condition,
  className,
  ...props
}: ConditionBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] uppercase tracking-wider font-semibold py-0 px-1.5 h-5",
        conditionStyles[condition],
        className
      )}
      {...props}
    >
      {condition}
    </Badge>
  );
}
