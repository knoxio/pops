# US-04: Build page-level navigation (back button + breadcrumbs)

> PRD: [005 — Shell](README.md)
> Status: Partial

## Description

As a developer, I want a standard page header pattern with back button and breadcrumbs for drill-down pages so that users always know where they are and can navigate up.

## Acceptance Criteria

- [x] Breadcrumb component available in `@pops/ui` (uses the primitive from PRD-003)
- [x] Drill-down pages show: ArrowLeft back button → breadcrumb trail → page title
- [x] Back button navigates to **logical parent** (not `history.back()`)
- [x] Breadcrumb segments are clickable links except the current page (plain text)
- [x] Separator is consistent across all apps (`›` or `/`)
- [x] Clickable segments: `text-muted-foreground hover:text-foreground`
- [x] Current page: `text-foreground font-medium`, not clickable
- [x] On mobile, middle breadcrumb segments collapse to `…` — first and last always visible
- [x] Top-level pages (sidebar-accessible) show neither back button nor breadcrumbs
- [x] Back navigation is never placed at the bottom of the page
- [ ] All drill-down pages across all apps use the shared PageHeader pattern — no inline h1 styling

## Notes

Standard page header pattern:

```tsx
<div className="flex items-center gap-3">
  <Link to={parentPath}>
    <ArrowLeft className="h-5 w-5" />
  </Link>
  <Breadcrumb items={[{ label: 'Library', href: '/media' }, { label: movie.title }]} />
</div>
```

Every app PRD that defines drill-down pages must use this pattern.
