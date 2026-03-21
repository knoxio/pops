import type { ComponentProps } from "react";
import { Badge } from "../primitives/badge";
import { cn } from "../lib/utils";

export interface TypeBadgeProps
  extends Omit<ComponentProps<typeof Badge>, "variant" | "children"> {
  type: string;
}

export function TypeBadge({ type, className, ...props }: TypeBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] uppercase tracking-wider font-semibold py-0 px-1.5 h-5",
        className
      )}
      {...props}
    >
      {type}
    </Badge>
  );
}
