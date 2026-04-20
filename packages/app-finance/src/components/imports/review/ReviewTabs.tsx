import { AlertCircle, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pops/ui';

import { FailedTab } from './FailedTab';
import { MatchedTab } from './MatchedTab';
import { SkippedTab } from './SkippedTab';
import { UncertainTab } from './UncertainTab';

import type { groupTransactionsByEntity } from '../../../lib/transaction-utils';
import type { ProcessedTransaction } from '../../../store/importStore';
import type { ViewMode } from '../hooks/useTransactionReview';

export interface ReviewTabsProps {
  activeTab: string;
  onTabChange: (value: string) => void;
  localTransactions: {
    matched: ProcessedTransaction[];
    uncertain: ProcessedTransaction[];
    failed: ProcessedTransaction[];
    skipped: ProcessedTransaction[];
  };
  uncertainGroups: ReturnType<typeof groupTransactionsByEntity>;
  failedGroups: ReturnType<typeof groupTransactionsByEntity>;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  editingTransaction: ProcessedTransaction | null;
  handleEdit: (t: ProcessedTransaction) => void;
  handleSaveEdit: (t: ProcessedTransaction, edited: Partial<ProcessedTransaction>) => void;
  handleCancelEdit: () => void;
  handleEntitySelect: (t: ProcessedTransaction, entityId: string, entityName: string) => void;
  handleBulkEntitySelect: (
    ts: ProcessedTransaction[],
    entityId: string,
    entityName: string
  ) => void;
  handleCreateEntity: (t: ProcessedTransaction) => void;
  handleAcceptAiSuggestion: (t: ProcessedTransaction) => void;
  handleAcceptAll: (ts: ProcessedTransaction[]) => void;
  handleCreateAndAssignAll: (ts: ProcessedTransaction[], entityName: string) => void;
  entities?: Array<{ id: string; name: string; type: string }>;
}

function buildTabSharedProps(props: ReviewTabsProps) {
  return {
    viewMode: props.viewMode,
    onViewModeChange: props.setViewMode,
    onEntitySelect: props.handleEntitySelect,
    onBulkEntitySelect: props.handleBulkEntitySelect,
    onCreateEntity: props.handleCreateEntity,
    onAcceptAiSuggestion: props.handleAcceptAiSuggestion,
    onAcceptAll: props.handleAcceptAll,
    onCreateAndAssignAll: props.handleCreateAndAssignAll,
    onEdit: props.handleEdit,
    editingTransaction: props.editingTransaction,
    onSaveEdit: props.handleSaveEdit,
    onCancelEdit: props.handleCancelEdit,
    entities: props.entities,
  };
}

export function ReviewTabs(props: ReviewTabsProps) {
  const { activeTab, onTabChange, localTransactions, uncertainGroups, failedGroups } = props;
  const tabSharedProps = buildTabSharedProps(props);
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
      <ReviewTabsList localTransactions={localTransactions} />
      <TabsContent value="matched" className="mt-4">
        <MatchedTab
          transactions={localTransactions.matched}
          onEdit={props.handleEdit}
          onEntitySelect={props.handleEntitySelect}
          onCreateEntity={props.handleCreateEntity}
          editingTransaction={props.editingTransaction}
          onSaveEdit={props.handleSaveEdit}
          onCancelEdit={props.handleCancelEdit}
          entities={props.entities}
        />
      </TabsContent>
      <TabsContent value="uncertain" className="mt-4">
        <UncertainTab
          transactions={localTransactions.uncertain}
          groups={uncertainGroups}
          {...tabSharedProps}
        />
      </TabsContent>
      <TabsContent value="failed" className="mt-4">
        <FailedTab
          transactions={localTransactions.failed}
          groups={failedGroups}
          {...tabSharedProps}
        />
      </TabsContent>
      <TabsContent value="skipped" className="mt-4">
        <SkippedTab transactions={localTransactions.skipped} />
      </TabsContent>
    </Tabs>
  );
}

function ReviewTabsList({
  localTransactions,
}: {
  localTransactions: ReviewTabsProps['localTransactions'];
}) {
  return (
    <TabsList className="grid w-full grid-cols-4">
      <TabsTrigger value="matched" className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4" />
        <span>Matched ({localTransactions.matched.length})</span>
      </TabsTrigger>
      <TabsTrigger value="uncertain" className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        <span>Uncertain ({localTransactions.uncertain.length})</span>
      </TabsTrigger>
      <TabsTrigger value="failed" className="flex items-center gap-2">
        <XCircle className="w-4 h-4" />
        <span>Failed ({localTransactions.failed.length})</span>
      </TabsTrigger>
      <TabsTrigger value="skipped" className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        <span>Skipped ({localTransactions.skipped.length})</span>
      </TabsTrigger>
    </TabsList>
  );
}
