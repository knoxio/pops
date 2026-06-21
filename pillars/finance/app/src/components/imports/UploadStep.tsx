import Papa from 'papaparse';
import { useCallback, useState } from 'react';

import { Button, RadioInput } from '@pops/ui';

import { useImportStore } from '../../store/importStore';
import { FileUpload } from './FileUpload';

import type { BankType } from '../../store/import-store-types';

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

const BANK_OPTIONS = [
  { value: 'ANZ', label: 'ANZ', description: 'Everyday, Savings' },
  { value: 'Amex', label: 'Amex', description: 'American Express' },
  { value: 'ING', label: 'ING', description: 'Savings, Everyday' },
  { value: 'Up', label: 'Up', description: 'Everyday, Round Up' },
] satisfies Array<{ value: BankType; label: string; description: string }>;

const BANK_HELP: Record<BankType, string> = {
  ANZ: 'Log in to ANZ Internet Banking, open your account, and export transactions as CSV.',
  Amex: 'Log in to your Amex online portal and download your transactions as a CSV export.',
  ING: 'Log in to ING Banking Online, open your account, and export transactions as CSV.',
  Up: 'In the Up app, go to your account, tap Export, and choose CSV format.',
};

function useUploadStep() {
  const { file, bankType, setFile, setBankType, setHeaders, setRows, nextStep } = useImportStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    (selectedFile: File | null) => {
      setFile(selectedFile);
      setError(null);
    },
    [setFile]
  );

  const handleBankChange = useCallback(
    (value: string) => {
      setBankType(value as BankType);
    },
    [setBankType]
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

  return {
    file,
    bankType,
    isProcessing,
    error,
    handleFileSelect,
    handleBankChange,
    handleNext,
  };
}

export function UploadStep() {
  const { file, bankType, isProcessing, error, handleFileSelect, handleBankChange, handleNext } =
    useUploadStep();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Upload CSV</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Select your bank and upload a CSV export to import transactions.
        </p>
      </div>

      <RadioInput
        label="Bank"
        options={BANK_OPTIONS}
        value={bankType}
        onValueChange={handleBankChange}
        orientation="horizontal"
      />

      <FileUpload
        onFileSelect={handleFileSelect}
        acceptedTypes=".csv"
        maxSizeMB={25}
        initialFile={file}
      />

      <div className="bg-info/5 border border-info/20 rounded-lg p-4">
        <h3 className="text-sm font-medium text-info mb-2">
          How to export from {BANK_OPTIONS.find((b) => b.value === bankType)?.label ?? bankType}
        </h3>
        <p className="text-xs text-info">{BANK_HELP[bankType]}</p>
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
