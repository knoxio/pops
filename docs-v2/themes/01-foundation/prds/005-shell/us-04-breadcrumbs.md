# US-04: Build page-level navigation (back button + breadcrumbs)

> PRD: [005 — Shell](README.md)
> Status: Partial

**GH Issue:** #405

## Audit Findings

**Present:**
- `Breadcrumb` primitive available in `@pops/ui` (shadcn-based, at `packages/ui/src/primitives/breadcrumb.tsx`)
- `LocationBreadcrumb.tsx` composite in `@pops/ui` for inventory location hierarchies (with click handlers and segments)

**Missing:**
- No shared `PageHeader` component or standard page header pattern in `@pops/ui` combining a back button + breadcrumb
- No drill-down pages in the codebase implement the `ArrowLeft + Breadcrumb` pattern from the spec
- The `TopBar` does not include a contextual breadcrumb area
- Mobile collapse behaviour (`…` for middle segments) is not implemented

## Description

As a developer, I want a standard page header pattern with back button and breadcrumbs for drill-down pages so that users always know where they are and can navigate up.

## Acceptance Criteria

- [ ] Breadcrumb component available in `@pops/ui` (uses the primitive from PRD-003)
- [ ] Drill-down pages show: ArrowLeft back button → breadcrumb trail → page title
- [ ] Back button navigates to **logical parent** (not `history.back()`)
- [ ] Breadcrumb segments are clickable links except the current page (plain text)
- [ ] Separator is consistent across all apps (`›` or `/`)
- [ ] Clickable segments: `text-muted-foreground hover:text-foreground`
- [ ] Current page: `text-foreground font-medium`, not clickable
- [ ] On mobile, middle breadcrumb segments collapse to `…` — first and last always visible
- [ ] Top-level pages (sidebar-accessible) show neither back button nor breadcrumbs
- [ ] Back navigation is never placed at the bottom of the page

## Notes

Standard page header pattern:
```tsx
<div className="flex items-center gap-3">
  <Link to={parentPath}><ArrowLeft className="h-5 w-5" /></Link>
  <Breadcrumb items={[
    { label: "Library", href: "/media" },
    { label: movie.title },
  ]} />
</div>
```

Every app PRD that defines drill-down pages must use this pattern.
