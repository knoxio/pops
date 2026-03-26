import type { ComponentProps } from "react";
import { Badge } from "../primitives/badge";
import { cn } from "../lib/utils";

export interface TypeBadgeProps extends Omit<ComponentProps<typeof Badge>, "variant" | "children"> {
  type: string;
}

const typeStyles: Record<string, string> = {
  Electronics: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400",
  Furniture: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400",
  Appliance: "bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-400",
  Clothing: "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-400",
  Tools: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400",
  Sports: "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-400",
};

export function TypeBadge({ type, className, ...props }: TypeBadgeProps) {
  const style = typeStyles[type] || "bg-muted text-muted-foreground border-transparent";

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-2xs uppercase tracking-wider font-semibold py-0 px-1.5 h-5",
        style,
        className
      )}
      {...props}
    >
      {type}
    </Badge>
  );
}
