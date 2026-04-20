/**
 * PageHeader — shared page header with back button, breadcrumbs, and title.
 *
 * For drill-down pages: shows ArrowLeft back button + breadcrumb trail + page title.
 * For top-level pages: shows just the page title (omit backHref and breadcrumbs).
 *
 * Router-agnostic: pass `renderLink` to use your router's Link component
 * for client-side navigation. Defaults to `<a>`.
 */
import { ArrowLeft } from 'lucide-react';
import { type ComponentType, Fragment, type ReactNode } from 'react';

import { cn } from '../lib/utils';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../primitives/breadcrumb';

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  /** Page title displayed as heading */
  title: ReactNode;
  /** Optional icon rendered before the title */
  icon?: ReactNode;
  /** Optional description shown below the title */
  description?: ReactNode;
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
        <LinkComponent to={segment.href} className="text-muted-foreground hover:text-foreground">
          {segment.label}
        </LinkComponent>
      </BreadcrumbLink>
    );
  }
  return <BreadcrumbPage className="text-foreground font-medium">{segment.label}</BreadcrumbPage>;
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
          <BreadcrumbPage className="text-foreground font-medium">{segment.label}</BreadcrumbPage>
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

function HeaderTitle({
  icon,
  title,
  description,
  actions,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-3">
          {icon}
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
        </div>
        {description && <p className="text-muted-foreground text-sm mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  icon,
  description,
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
      <header className={cn('space-y-1', className)}>
        <HeaderTitle icon={icon} title={title} description={description} actions={actions} />
      </header>
    );
  }

  return (
    <header className={cn('space-y-2', className)}>
      <div className="flex items-center gap-3">
        {backHref && (
          <LinkComponent
            to={backHref}
            className="min-w-11 min-h-11 flex items-center justify-center hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Go back</span>
          </LinkComponent>
        )}
        {hasBreadcrumbs && (
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItems segments={breadcrumbs} LinkComponent={LinkComponent} />
            </BreadcrumbList>
          </Breadcrumb>
        )}
      </div>
      <HeaderTitle icon={icon} title={title} description={description} actions={actions} />
    </header>
  );
}
