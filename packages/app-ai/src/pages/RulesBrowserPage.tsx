import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, PageHeader } from '@pops/ui';

import { RuleFormDialog } from './rules-browser/rule-form/RuleFormDialog';
import { useRulePreview } from './rules-browser/rule-form/useRulePreview';
/**
 * RulesBrowserPage — browse, filter, adjust, and delete AI categorisation rules.
 * PRD-053/US-02 (tb-542). #2187 adds manual create/edit + preview.
 */
import { DeleteRuleDialog } from './rules-browser/sections/DeleteRuleDialog';
import { RulesErrorState } from './rules-browser/sections/RulesErrorState';
import { RulesFilters } from './rules-browser/sections/RulesFilters';
import { RulesLoadingState } from './rules-browser/sections/RulesLoadingState';
import { RulesPagination } from './rules-browser/sections/RulesPagination';
import { RulesTable } from './rules-browser/sections/RulesTable';
import { PAGE_SIZE, useRulesBrowserModel } from './rules-browser/useRulesBrowserModel';

type Model = ReturnType<typeof useRulesBrowserModel>;

function FiltersSection({ model }: { model: Model }) {
  return (
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
  );
}

function PaginationSection({ model }: { model: Model }) {
  if (!model.pagination) return null;
  return (
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
  );
}

function RulesBrowserBody({ model }: { model: Model }) {
  const { t } = useTranslation('ai');
  // Watch the form's pattern + matchType so the preview pane stays in sync
  // with the user's edits without having to re-open the dialog.
  const watchedPattern = model.ruleForm.form.watch('descriptionPattern');
  const watchedMatchType = model.ruleForm.form.watch('matchType');
  const preview = useRulePreview({
    pattern: watchedPattern,
    matchType: watchedMatchType,
    enabled: model.isFormOpen,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('rules.title')}
        description={t('rules.description')}
        actions={
          <Button onClick={model.handleAddRule} prefix={<Plus className="h-4 w-4" />}>
            {t('rules.addRule')}
          </Button>
        }
      />

      <FiltersSection model={model} />

      <RulesTable
        corrections={model.corrections}
        onAutoDelete={model.handleAutoDelete}
        onDeleteClick={model.setDeleteId}
        onEditClick={model.handleEditRule}
      />

      <PaginationSection model={model} />

      <DeleteRuleDialog
        open={!!model.deleteId}
        onOpenChange={(open) => {
          if (!open) model.setDeleteId(null);
        }}
        onConfirm={model.handleDelete}
        isPending={model.deleteMutation.isPending}
      />

      <RuleFormDialog
        open={model.isFormOpen}
        onOpenChange={model.setIsFormOpen}
        editingRule={model.ruleForm.editingRule}
        form={model.ruleForm.form}
        isSubmitting={model.ruleForm.isSubmitting}
        onSubmit={model.ruleForm.onSubmit}
        preview={preview}
      />
    </div>
  );
}

export function RulesBrowserPage(): React.ReactElement {
  const model = useRulesBrowserModel();

  if (model.isLoading) return <RulesLoadingState />;
  if (model.isError) return <RulesErrorState onRetry={() => model.refetch()} />;
  return <RulesBrowserBody model={model} />;
}
