# US-02: Build primitive components

> PRD: [003 — Components](README.md)
> Status: To Review

## Description

As a developer, I want all 28 Shadcn/Radix primitive components in `@pops/ui/primitives/` so that any app can use base UI elements like Button, Card, Dialog, Input, etc.

## Acceptance Criteria

- [ ] All 28 primitives exist in `packages/ui/src/primitives/`: Accordion, AlertDialog, Alert, Avatar, Badge, Breadcrumb, Button, Card, Checkbox, Collapsible, Command, Dialog, DropdownMenu, Input, Label, Popover, Progress, RadioGroup, Select, Separator, Skeleton, Slider, Sonner, Switch, Table, Tabs, Textarea, Tooltip
- [ ] Each primitive has a co-located `.stories.tsx` file (where applicable)
- [ ] All primitives exported from barrel `index.ts`
- [ ] All primitives use design tokens from PRD-002 — no hardcoded colours or arbitrary values
- [ ] Storybook renders all primitive stories
- [ ] Light and dark mode work for all primitives

## Notes

Primitives are Shadcn/Radix-based — accessible, unstyled, composable. They provide the building blocks that composite components build on. Stories for primitives that are only used inside composites (e.g., Label) can be skipped.
