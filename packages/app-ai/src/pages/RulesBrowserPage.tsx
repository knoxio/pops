import { PageHeader } from '@pops/ui';

/**
 * RulesBrowserPage — browse, filter, adjust, and delete AI categorisation rules.
 * PRD-053/US-02 (tb-542).
 */
import { DeleteRuleDialog } from './rules-browser/sections/DeleteRuleDialog';
import { RulesErrorState } from './rules-browser/sections/RulesErrorState';
import { RulesFilters } from './rules-browser/sections/RulesFilters';
import { RulesLoadingState } from './rules-browser/sections/RulesLoadingState';
import { RulesPagination } from './rules-browser/sections/RulesPagination';
import { RulesTable } from './rules-browser/sections/RulesTable';
import { PAGE_SIZE, useRulesBrowserModel } from './rules-browser/useRulesBrowserModel';

export function RulesBrowserPage(): React.ReactElement {
  const model = useRulesBrowserModel();

  if (model.isLoading) return <RulesLoadingState />;
  if (model.isError) return <RulesErrorState onRetry={() => model.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorisation Rules"
        description="Browse and manage AI categorisation rules"
      />

      <RulesFilters
        matchType={model.matchType}
        minConfidence={model.minConfidence}
        onMatchTypeChange={(value) => {
          model.setMatchType(value);
          model.resetPage();
        }}
        onMinConfidenceChange={(value) => {
          model.setMinConfidence(value);
          model.resetPage();
        }}
        onClear={() => {
          model.setMatchType('');
          model.setMinConfidence('');
          model.resetPage();
        }}
      />

      <RulesTable
        corrections={model.corrections}
        onAutoDelete={model.handleAutoDelete}
        onDeleteClick={model.setDeleteId}
      />

      {model.pagination && (
        <RulesPagination
          total={model.pagination.total}
          offset={model.offset}
          currentPage={model.currentPage}
          totalPages={model.totalPages}
          onPrevious={() => {
            model.setOffset(Math.max(0, model.offset - PAGE_SIZE));
          }}
          onNext={() => {
            model.setOffset(model.offset + PAGE_SIZE);
          }}
        />
      )}

      <DeleteRuleDialog
        open={!!model.deleteId}
        onOpenChange={(open) => {
          if (!open) model.setDeleteId(null);
        }}
        onConfirm={model.handleDelete}
        isPending={model.deleteMutation.isPending}
      />
    </div>
  );
}
