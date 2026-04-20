import Papa from 'papaparse';
import { useCallback, useState } from 'react';

import { Button } from '@pops/ui';

import { useImportStore } from '../../store/importStore';
import { FileUpload } from './FileUpload';

interface ParseResult {
  ok: boolean;
  error?: string;
  headers?: string[];
  rows?: Record<string, string>[];
}

function parseCsvFile(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          resolve({
            ok: false,
            error: `CSV parsing error: ${results.errors[0]?.message ?? 'Unknown error'}`,
          });
          return;
        }
        if (results.data.length === 0) {
          resolve({ ok: false, error: 'CSV file is empty' });
          return;
        }
        const headers = results.meta.fields ?? [];
        if (headers.length === 0) {
          resolve({ ok: false, error: 'CSV file has no headers' });
          return;
        }
        resolve({ ok: true, headers, rows: results.data });
      },
      error: (error) => resolve({ ok: false, error: `Failed to parse CSV: ${error.message}` }),
    });
  });
}

function UploadFooter({
  onNext,
  disabled,
  isProcessing,
}: {
  onNext: () => void;
  disabled: boolean;
  isProcessing: boolean;
}) {
  return (
    <div className="flex justify-end gap-3">
      <Button onClick={onNext} disabled={disabled}>
        {isProcessing ? 'Processing...' : 'Next'}
      </Button>
    </div>
  );
}

function useUploadStep() {
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

  const handleNext = useCallback(async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }
    setIsProcessing(true);
    setError(null);
    const result = await parseCsvFile(file);
    setIsProcessing(false);
    if (!result.ok) {
      setError(result.error ?? 'Unknown error');
      return;
    }
    setHeaders(result.headers ?? []);
    setRows(result.rows ?? []);
    nextStep();
  }, [file, setHeaders, setRows, nextStep]);

  return { file, isProcessing, error, handleFileSelect, handleNext };
}

/**
 * Step 1: Upload CSV file and parse it
 */
export function UploadStep() {
  const { file, isProcessing, error, handleFileSelect, handleNext } = useUploadStep();

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

      <UploadFooter
        onNext={handleNext}
        disabled={!file || isProcessing}
        isProcessing={isProcessing}
      />
    </div>
  );
}
