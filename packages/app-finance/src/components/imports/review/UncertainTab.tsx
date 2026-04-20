import { EmptyStateTab } from '@pops/ui';

import { GroupedView, ListView, type ReviewTabBaseProps, ViewModeToggle } from './ReviewTabShared';

/**
 * Uncertain tab - needs user review
 */
export function UncertainTab(props: ReviewTabBaseProps) {
  if (props.transactions.length === 0) {
    return <EmptyStateTab message="No uncertain transactions" />;
  }
  return (
    <div className="space-y-4">
      <ViewModeToggle viewMode={props.viewMode} onViewModeChange={props.onViewModeChange} />
      {props.viewMode === 'grouped' ? (
        <GroupedView variant="uncertain" props={props} />
      ) : (
        <ListView variant="uncertain" props={props} />
      )}
    </div>
  );
}
