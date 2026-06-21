/**
 * Shared placeholder content for each `/food/data/<slug>` tab.
 *
 * PR-122-A ships the routing + the tab strip. The actual tab content
 * (Ingredients tree, Aliases table, etc.) lands in follow-up PRs that
 * fill in `tabContent` per-tab.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pops/ui';

interface TabPlaceholderProps {
  title: string;
  description: string;
  pendingLabel: string;
}

export function TabPlaceholder({ title, description, pendingLabel }: TabPlaceholderProps) {
  return (
    <Card aria-label={title}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">{pendingLabel}</CardContent>
    </Card>
  );
}
