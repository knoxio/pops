import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, AlertTitle } from '../primitives/alert';

export interface ErrorAlertProps {
  title: string;
  message: string;
  /** Optional technical details rendered in a collapsible code block */
  details?: string;
  className?: string;
}

/**
 * Standardised destructive alert for API/load errors across all pages.
 */
export function ErrorAlert({ title, message, details, className }: ErrorAlertProps) {
  const { t } = useTranslation('ui');
  return (
    <Alert variant="destructive" className={className}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p className="mb-2">{message}</p>
        {details && (
          <details className="mt-3">
            <summary className="cursor-pointer hover:underline font-medium text-sm">
              {t('errorAlert.showDetails')}
            </summary>
            <code className="block mt-2 p-3 bg-black/10 dark:bg-black/20 rounded text-xs font-mono whitespace-pre-wrap break-all">
              {details}
            </code>
          </details>
        )}
      </AlertDescription>
    </Alert>
  );
}
