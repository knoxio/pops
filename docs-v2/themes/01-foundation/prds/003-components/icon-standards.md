# Icon Standards

POPS uses [Lucide React](https://lucide.dev/) as its single icon library. No other icon sets are permitted.

## Icon Vocabulary

| Action | Icon | Banned alternatives |
|--------|------|---------------------|
| Add / Create | `Plus` | |
| Edit | `Pencil` | `Edit2`, `PenLine` |
| Delete / Remove | `Trash2` | `Trash` |
| Close / Dismiss | `X` | |
| More actions | `MoreHorizontal` or `MoreVertical` | `Ellipsis` |
| Search | `Search` | |
| Settings | `Settings` | `Cog`, `Gear` |
| Back / Navigate | `ArrowLeft`, `ChevronLeft` | |
| External link | `ExternalLink` | |
| Download | `Download` | |
| Upload | `Upload` | |
| Refresh | `RefreshCw` | `RefreshCcw` |

## Accessibility

- Icon-only buttons **must** have an `aria-label` describing the action
- Use `aria-label` (not just `title`) for screen reader support
- `title` may be added alongside `aria-label` for sighted hover tooltips

```tsx
// Correct
<Button size="icon" aria-label="Delete item">
  <Trash2 className="h-4 w-4" />
</Button>

// Incorrect — no aria-label
<Button size="icon">
  <Trash2 className="h-4 w-4" />
</Button>
```

## Button Patterns

| Context | Pattern | Example |
|---------|---------|---------|
| Page CTAs, form buttons | Icon + text | `<Button><Plus /> Add Item</Button>` |
| Table rows, list items | Icon-only with `aria-label` | `<Button size="icon" aria-label="Edit">` |
| Destructive actions | `variant="ghost"` + `text-destructive` | Delete, unlink, disconnect buttons |

## Navigation Icons

Navigation icons are registered in `apps/pops-shell/src/app/nav/icon-map.ts`. All navigation uses Lucide icons from this shared registry.
