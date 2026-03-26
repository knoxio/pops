/**
 * PageHeader — shared page header with back button, breadcrumbs, and title.
 *
 * For drill-down pages: shows ArrowLeft back button + breadcrumb trail + page title.
 * For top-level pages: shows just the page title (omit backHref and breadcrumbs).
 *
 * Router-agnostic: pass `renderLink` to use your router's Link component
 * for client-side navigation. Defaults to `<a>`.
 */
import { Fragment, type ReactNode, type ComponentType } from "react";
import { ArrowLeft } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from "../primitives/breadcrumb";
import { cn } from "../lib/utils";

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  /** Page title displayed as heading */
  title: ReactNode;
  /** URL of the logical parent page — shows back button when provided */
  backHref?: string;
  /** Breadcrumb segments — last segment is the current page (not clickable) */
  breadcrumbs?: BreadcrumbSegment[];
  /** Optional actions rendered to the right of the title */
  actions?: ReactNode;
  /** Custom link component for client-side routing (e.g. react-router Link) */
  renderLink?: ComponentType<{ to: string; className?: string; children: ReactNode }>;
  className?: string;
}

function DefaultLink({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={to} className={className}>
      {children}
    </a>
  );
}

/**
 * Collapse middle breadcrumb segments on mobile.
 * Always shows first and last; middle segments get an ellipsis on small screens.
 */
function SegmentLink({
  segment,
  LinkComponent,
}: {
  segment: BreadcrumbSegment;
  LinkComponent: ComponentType<{ to: string; className?: string; children: ReactNode }>;
}) {
  if (segment.href) {
    return (
      <BreadcrumbLink asChild>
        <LinkComponent
          to={segment.href}
          className="text-muted-foreground hover:text-foreground"
        >
          {segment.label}
        </LinkComponent>
      </BreadcrumbLink>
    );
  }
  return (
    <BreadcrumbPage className="text-foreground font-medium">
      {segment.label}
    </BreadcrumbPage>
  );
}

function BreadcrumbItems({
  segments,
  LinkComponent,
}: {
  segments: BreadcrumbSegment[];
  LinkComponent: ComponentType<{ to: string; className?: string; children: ReactNode }>;
}) {
  if (segments.length === 0) return null;

  const hasMiddleSegments = segments.length > 2;

  return segments.map((segment, index) => {
    const isLast = index === segments.length - 1;
    const isFirst = index === 0;
    const isMiddle = !isFirst && !isLast;

    // Last segment — current page, not clickable, no separator after
    if (isLast) {
      return (
        <BreadcrumbItem key={`${segment.label}-${index}`}>
          <BreadcrumbPage className="text-foreground font-medium">
            {segment.label}
          </BreadcrumbPage>
        </BreadcrumbItem>
      );
    }

    // Middle segments: hidden on mobile, replaced by ellipsis on first segment
    if (isMiddle && hasMiddleSegments) {
      return (
        <Fragment key={`${segment.label}-${index}`}>
          <BreadcrumbItem className="hidden sm:inline-flex">
            <SegmentLink segment={segment} LinkComponent={LinkComponent} />
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:flex" />
        </Fragment>
      );
    }

    // First segment with ellipsis for collapsed middle segments on mobile
    if (isFirst && hasMiddleSegments) {
      return (
        <Fragment key={`${segment.label}-${index}`}>
          <BreadcrumbItem>
            <SegmentLink segment={segment} LinkComponent={LinkComponent} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {/* Ellipsis for collapsed middle segments on mobile */}
          <BreadcrumbItem className="sm:hidden">
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
          <BreadcrumbSeparator className="sm:hidden" />
        </Fragment>
      );
    }

    // First segment when no middle segments exist (2 segments total)
    return (
      <Fragment key={`${segment.label}-${index}`}>
        <BreadcrumbItem>
          <SegmentLink segment={segment} LinkComponent={LinkComponent} />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
      </Fragment>
    );
  });
}

export function PageHeader({
  title,
  backHref,
  breadcrumbs,
  actions,
  renderLink: LinkComponent = DefaultLink,
  className,
}: PageHeaderProps) {
  const hasBreadcrumbs = breadcrumbs && breadcrumbs.length > 0;
  const isTopLevel = !backHref && !hasBreadcrumbs;

  if (isTopLevel) {
    return (
      <header className={cn("space-y-1", className)}>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </header>
    );
  }

  return (
    <header className={cn("space-y-2", className)}>
      <div className="flex items-center gap-3">
        {backHref && (
          <LinkComponent
            to={backHref}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Go back</span>
          </LinkComponent>
        )}
        {hasBreadcrumbs && (
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItems
                segments={breadcrumbs}
                LinkComponent={LinkComponent}
              />
            </BreadcrumbList>
          </Breadcrumb>
        )}
      </div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
