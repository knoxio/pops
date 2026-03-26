import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../primitives/breadcrumb";
import { cn } from "../lib/utils";

export interface LocationSegment {
  id: string;
  name: string;
}

export interface LocationBreadcrumbProps {
  segments: LocationSegment[];
  onNavigate?: (segment: LocationSegment) => void;
  className?: string;
}

export function LocationBreadcrumb({ segments, onNavigate, className }: LocationBreadcrumbProps) {
  if (segments.length === 0) {
    return <span className="text-muted-foreground/50">—</span>;
  }

  return (
    <Breadcrumb className={cn("text-xs", className)}>
      <BreadcrumbList className="flex-nowrap text-xs gap-1 sm:gap-1">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          return (
            <BreadcrumbItem key={segment.id}>
              {isLast ? (
                <BreadcrumbPage className="text-xs font-medium">{segment.name}</BreadcrumbPage>
              ) : (
                <>
                  <BreadcrumbLink
                    className="text-xs cursor-pointer"
                    onClick={() => onNavigate?.(segment)}
                  >
                    {segment.name}
                  </BreadcrumbLink>
                  <BreadcrumbSeparator className="[&>svg]:size-3" />
                </>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
