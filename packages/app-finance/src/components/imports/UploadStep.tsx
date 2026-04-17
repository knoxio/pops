import Papa from 'papaparse';
import { useCallback, useState } from 'react';

import { Button } from '@pops/ui';

import { useImportStore } from '../../store/importStore';
import { FileUpload } from './FileUpload';

/**
 * Step 1: Upload CSV file and parse it
 */
export function UploadStep() {
  const { file, setFile, setHeaders, setRows, nextStep } = useImportStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    (selectedFile: File | null) => {
      setFile(selectedFile);
      setError(null);
    },
    [setFile]
  );

  const handleNext = useCallback(() => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    setIsProcessing(true);
    setError(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setError(`CSV parsing error: ${results.errors[0]?.message ?? 'Unknown error'}`);
          setIsProcessing(false);
          return;
        }

        if (results.data.length === 0) {
          setError('CSV file is empty');
          setIsProcessing(false);
          return;
        }

        const headers = results.meta.fields ?? [];
        if (headers.length === 0) {
          setError('CSV file has no headers');
          setIsProcessing(false);
          return;
        }

        setHeaders(headers);
        setRows(results.data);
        setIsProcessing(false);
        nextStep();
      },
      error: (error) => {
        setError(`Failed to parse CSV: ${error.message}`);
        setIsProcessing(false);
      },
    });
  }, [file, setHeaders, setRows, nextStep]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Upload CSV</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Select an Amex CSV export file to import transactions.
        </p>
      </div>

      <FileUpload
        onFileSelect={handleFileSelect}
        acceptedTypes=".csv"
        maxSizeMB={25}
        initialFile={file}
      />

      <div className="bg-info/5 border border-info/20 rounded-lg p-4">
        <h3 className="text-sm font-medium text-info mb-2">Bank: American Express (Amex)</h3>
        <p className="text-xs text-info">
          Download your Amex transactions as CSV from your online banking portal.
        </p>
      </div>

      {error && (
        <div className="p-4 text-sm text-destructive bg-destructive/10 dark:text-destructive/40 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button onClick={handleNext} disabled={!file || isProcessing}>
          {isProcessing ? 'Processing...' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
