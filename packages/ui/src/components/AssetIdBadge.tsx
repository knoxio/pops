import type { ComponentProps } from "react";
import { Badge } from "../primitives/badge";
import { cn } from "../lib/utils";

export interface AssetIdBadgeProps extends Omit<
  ComponentProps<typeof Badge>,
  "variant" | "children"
> {
  assetId: string;
}

export function AssetIdBadge({ assetId, className, ...props }: AssetIdBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("font-mono text-[10px] tracking-wider px-1.5 py-0 h-5", className)}
      {...props}
    >
      {assetId}
    </Badge>
  );
}
