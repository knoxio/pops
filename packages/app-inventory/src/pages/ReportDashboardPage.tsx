import { FileText } from 'lucide-react';
import { useNavigate } from 'react-router';

/**
 * ReportDashboardPage — inventory reporting hub at `/inventory/report`.
 *
 * Shows the summary dashboard widgets (item count, values, expiring warranties,
 * recently added) and a navigation card to the detailed insurance report.
 * PRD-051/US-01.
 */
import { Button, PageHeader } from '@pops/ui';

import { DashboardWidgets } from '../components/DashboardWidgets';

export function ReportDashboardPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" />

      <DashboardWidgets />

      <div className="pt-2">
        <Button
          variant="outline"
          prefix={<FileText className="h-4 w-4" />}
          onClick={() => navigate('/inventory/report/insurance')}
        >
          Insurance Report
        </Button>
      </div>
    </div>
  );
}
