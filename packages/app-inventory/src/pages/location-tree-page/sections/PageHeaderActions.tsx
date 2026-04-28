import { FileText, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Button } from '@pops/ui';

interface PageHeaderActionsProps {
  onAddRoot: () => void;
}

export function PageHeaderActions({ onAddRoot }: PageHeaderActionsProps) {
  const { t } = useTranslation('inventory');
  return (
    <>
      <Link
        to="/inventory/report/insurance"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <FileText className="h-4 w-4" />
        {t('locations.insuranceReport')}
      </Link>
      <Button
        variant="ghost"
        size="sm"
        className="text-app-accent hover:text-app-accent/80"
        prefix={<Plus className="h-4 w-4" />}
        onClick={onAddRoot}
      >
        {t('locations.addRootLocation')}
      </Button>
    </>
  );
}
