import type { useRuleManagerHooks } from './useRuleManagerHooks';

export function buildBodyProps(
  hooks: ReturnType<typeof useRuleManagerHooks>,
  handleAddNewRuleOp: () => void
) {
  const {
    localOpsHook,
    dialogState,
    dbTxnsQuery,
    previewHook,
    browse,
    selection,
    browseSelectedRule,
  } = hooks;
  return {
    errorMessage: browse.browseListQuery.isError ? browse.browseListQuery.error.message : null,
    isLoading: browse.browseListQuery.isLoading,
    search: dialogState.browseSearch,
    onSearchChange: dialogState.setBrowseSearch,
    orderedMerged: browse.browseOrderedMerged,
    orderedFiltered: browse.browseOrderedFiltered,
    canDragReorder: browse.browseCanDragReorder,
    selectedRuleId: selection.browseSelectedRuleId,
    onSelectRule: selection.handleBrowseSelectRule,
    onReorderFullList: browse.handleBrowseReorderFullList,
    localOps: localOpsHook.localOps,
    selectedOp: localOpsHook.selectedOp,
    onChangeSelectedOp: localOpsHook.updateOp,
    selectedRule: browseSelectedRule,
    onEditRule: selection.handleBrowseEditRule,
    onDisableRule: selection.handleBrowseDisableRule,
    onRemoveRule: selection.handleBrowseRemoveRule,
    onAddNewRule: handleAddNewRuleOp,
    previewView: dialogState.previewView,
    onPreviewViewChange: dialogState.setPreviewView,
    previewCombined: previewHook.combinedPreview,
    previewSelected: previewHook.selectedOpPreview,
    dbPreviewCombined: previewHook.combinedDbPreview,
    dbPreviewSelected: previewHook.selectedOpDbPreview,
    previewErrorCombined: previewHook.combinedPreviewError,
    previewErrorSelected: previewHook.selectedOpPreviewError,
    truncatedCombined: previewHook.combinedPreviewTruncated,
    truncatedSelected: previewHook.selectedOpPreviewTruncated,
    dbTruncated: dbTxnsQuery.data?.truncated,
    dbTotal: dbTxnsQuery.data?.total,
    isPreviewPending: previewHook.previewMutationPending,
    isPreviewStale: previewHook.hasDirty,
    onRerunPreview: previewHook.handleRerunPreview,
    disablePreview: localOpsHook.localOps.length === 0,
  };
}
