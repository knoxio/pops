import { Download, FileText, Printer } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';

import { Button, PageHeader, Skeleton } from '@pops/ui';

import { downloadCsv } from './insurance-report-page/csv';
import { GroupTable } from './insurance-report-page/GroupTable';
import { ReportFilters } from './insurance-report-page/ReportFilters';
import { ReportSummary } from './insurance-report-page/ReportSummary';
import { useReportModel } from './insurance-report-page/useReportModel';

function ReportActions({ onExportCsv }: { onExportCsv: () => void }) {
  return (
    <div className="flex items-center gap-2 print:hidden">
      <Button
        variant="outline"
        size="sm"
        prefix={<Download className="h-4 w-4" />}
        onClick={onExportCsv}
      >
        Export CSV
      </Button>
      <Button size="sm" prefix={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
        Print / PDF
      </Button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

type ReportData = NonNullable<ReturnType<typeof useReportModel>['report']>;

interface ReportContentProps {
  report: ReportData;
  today: string;
  model: ReturnType<typeof useReportModel>;
  onOpenItem: (id: string) => void;
}

function ReportContent({ report, today, model, onOpenItem }: ReportContentProps) {
  const { locationId, includeChildren, sortBy, locationTree, updateParam, handleLocationChange } =
    model;
  return (
    <div className="p-6 max-w-5xl mx-auto print:p-0 print:max-w-none print:text-[11pt]">
      <PageHeader
        title={<span className="print:text-[14pt]">Insurance Report</span>}
        icon={<FileText className="h-6 w-6 text-muted-foreground print:hidden" />}
        actions={<ReportActions onExportCsv={() => downloadCsv(report.groups)} />}
        className="mb-6 print:mb-4"
      />
      <p className="text-sm text-muted-foreground -mt-5 mb-6">
        Generated {today}
        {locationId && report.groups.length === 1 && report.groups[0] && (
          <> — {report.groups[0].locationName}</>
        )}
      </p>
      <ReportFilters
        locationId={locationId}
        includeChildren={includeChildren}
        sortBy={sortBy}
        locationTree={locationTree}
        onLocationChange={handleLocationChange}
        onIncludeChildrenChange={(checked) =>
          updateParam('includeChildren', checked ? null : 'false')
        }
        onSortByChange={(value) => updateParam('sortBy', value === 'value' ? null : value)}
      />
      <ReportSummary totalItems={report.totalItems} totalValue={report.totalValue} />
      {report.groups.map((group, groupIndex) => (
        <GroupTable
          key={group.locationId ?? 'unlocated'}
          group={group}
          groupIndex={groupIndex}
          onOpenItem={onOpenItem}
        />
      ))}
      {report.groups.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No inventory items found.</p>
        </div>
      )}
    </div>
  );
}

export function InsuranceReportPage(): React.ReactElement {
  const navigate = useNavigate();
  const model = useReportModel();
  const today = useMemo(
    () =>
      new Date().toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    []
  );

  if (model.isLoading) return <LoadingState />;
  if (!model.report) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Failed to load report.</p>
      </div>
    );
  }
  return (
    <ReportContent
      report={model.report}
      today={today}
      model={model}
      onOpenItem={(id) => navigate(`/inventory/items/${id}`)}
    />
  );
}
