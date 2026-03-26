/**
 * HorizontalScrollRow — a titled section with horizontally scrollable content.
 * Used on the Discover page for trending, recommendations, and similar sections.
 */
import { useRef } from "react";
import { cn, Button, Skeleton } from "@pops/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface HorizontalScrollRowProps {
  /** Section title. */
  title: string;
  /** Optional subtitle or source info. */
  subtitle?: string;
  /** Whether data is loading. */
  isLoading?: boolean;
  /** Number of skeleton items to show while loading. */
  skeletonCount?: number;
  /** Content to render inside the scroll area. */
  children: React.ReactNode;
  /** Additional CSS classes for the root element. */
  className?: string;
}

export function HorizontalScrollRow({
  title,
  subtitle,
  isLoading,
  skeletonCount = 6,
  children,
  className,
}: HorizontalScrollRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <section className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-end justify-between gap-2 px-1">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => scroll("left")}
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => scroll("right")}
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        {isLoading
          ? Array.from({ length: skeletonCount }, (_, i) => (
              <div key={i} className="w-36 shrink-0 space-y-2 sm:w-40">
                <Skeleton className="aspect-[2/3] w-full rounded-md" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))
          : children}
      </div>
    </section>
  );
}

HorizontalScrollRow.displayName = "HorizontalScrollRow";
