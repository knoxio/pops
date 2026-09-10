import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useImportStore } from '../../store/importStore';
import { AccountAndFormatFields } from './account-step/AccountAndFormatFields';
import { useAccountFormats } from './account-step/useAccountFormats';
import { FileUpload } from './FileUpload';
import { uploadRoute } from './pdf/anz-pdf-import';
import { PdfStatementFindings } from './pdf/PdfStatementFindings';
import { BANK_ACCEPTED_TYPES, bankTakesPdf } from './upload-step/bank-upload-config';
import { ContinuePending } from './upload-step/ContinuePending';
import { FormatMismatchAlert } from './upload-step/FormatMismatchAlert';
import { BankExportHelp, UploadFooter, UploadStepHeader } from './upload-step/UploadStepChrome';
import { useCsvStage } from './upload-step/useCsvStage';
import { usePdfStage } from './upload-step/usePdfStage';

import type { BankDialectId } from '../../store/import-store-types';

const MIXED_UPLOAD_ERROR =
  'Select either CSV exports or PDF statements, not both. They are read differently and a period covered by both would import twice.';

function UploadFileSection({
  files,
  rows,
  dialectId,
  formatMismatch,
  pdfStatement,
  handleFilesSelect,
  handleDismissMismatch,
}: {
  files: File[];
  rows: Record<string, string>[];
  dialectId: BankDialectId;
  formatMismatch: string | null;
  pdfStatement: ReturnType<typeof usePdfStage>['statement'];
  handleFilesSelect: (files: File[]) => void;
  handleDismissMismatch: () => void;
}) {
  const { t } = useTranslation('finance');
  return (
    <>
      <FileUpload
        onFilesSelect={handleFilesSelect}
        acceptedTypes={BANK_ACCEPTED_TYPES[dialectId]}
        maxSizeMB={25}
        maxTotalSizeMB={100}
        initialFiles={files}
      />

      {formatMismatch && (
        <FormatMismatchAlert
          dialectId={dialectId}
          headerRow={formatMismatch}
          onChangeFormat={handleDismissMismatch}
          onChooseAnotherFile={() => handleFilesSelect([])}
        />
      )}

      {pdfStatement && <PdfStatementFindings statement={pdfStatement} fileCount={files.length} />}

      {files.length === 0 && rows.length > 0 && (
        <div className="bg-info/5 border border-info/20 rounded-lg p-4">
          <p className="text-xs text-info">{t('import.resumeFileNotice')}</p>
        </div>
      )}

      <BankExportHelp dialectId={dialectId} />
    </>
  );
}

/**
 * The account is the source of truth for what `dialectId` may be — once its
 * dialects are known, steer away from whatever the store carried over
 * (another account's pick, or the store's static default) instead of parsing
 * this account's file under a dialect it cannot produce.
 */
function useDialectSteering(
  availableBanks: BankDialectId[],
  dialectId: BankDialectId,
  setDialectId: (value: BankDialectId) => void
): void {
  useEffect(() => {
    const [first] = availableBanks;
    if (first && !availableBanks.includes(dialectId)) {
      setDialectId(first);
    }
  }, [availableBanks, dialectId, setDialectId]);
}

function useUploadStep() {
  const { files, rows, dialectId, accountId, setFiles, setDialectId, nextStep } = useImportStore();
  const { account, availableBanks, liveProvider } = useAccountFormats(accountId);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formatMismatch, setFormatMismatch] = useState<string | null>(null);
  const pdf = usePdfStage(setError, setIsProcessing);
  const runCsv = useCsvStage(files, dialectId, { setError, setFormatMismatch, setIsProcessing });
  useDialectSteering(availableBanks, dialectId, setDialectId);

  const handleFilesSelect = useCallback(
    (selectedFiles: File[]) => {
      setFiles(selectedFiles);
      setError(null);
      setFormatMismatch(null);
      pdf.clear();
    },
    [setFiles, pdf]
  );

  const handleBankChange = useCallback(
    (value: string) => {
      setDialectId(value as BankDialectId);
      setFormatMismatch(null);
    },
    [setDialectId]
  );

  const handleDismissMismatch = useCallback(() => setFormatMismatch(null), []);

  const handleNext = useCallback(async () => {
    const route = uploadRoute(files);
    if (route === 'empty') {
      // A resumed run has parsed rows but no re-attached File handles; advance
      // without re-parsing instead of demanding a re-upload (which would cascade
      // a downstream reset over the restored work).
      if (rows.length > 0) nextStep();
      else setError('Please select at least one file');
      return;
    }
    if (route === 'mixed') {
      setError(MIXED_UPLOAD_ERROR);
      return;
    }
    await (route === 'pdf' ? pdf.run(files) : runCsv());
  }, [files, rows, nextStep, pdf, runCsv]);

  return {
    files,
    rows,
    dialectId,
    accountId,
    // Definitively known to have nothing to import, as opposed to "the
    // account hasn't resolved yet" (`account` still undefined) — only the
    // former should hide the file drop, or a still-loading account would
    // flash the "nothing to import" gate before it has anything to say.
    hasNoFormat: Boolean(account) && availableBanks.length === 0,
    // A live-fed account's rows arrive on their own; the section above says
    // what is waiting and opens it, so there is no file and no Next here.
    isLive: liveProvider !== null,
    isProcessing,
    error,
    formatMismatch,
    pdfStatement: pdf.statement,
    handleFilesSelect,
    handleBankChange,
    handleDismissMismatch,
    handleNext,
  };
}

export function UploadStep() {
  const {
    files,
    rows,
    dialectId,
    accountId,
    hasNoFormat,
    isLive,
    isProcessing,
    error,
    formatMismatch,
    pdfStatement,
    handleFilesSelect,
    handleBankChange,
    handleDismissMismatch,
    handleNext,
  } = useUploadStep();

  return (
    <div className="space-y-6">
      <ContinuePending />
      <UploadStepHeader takesPdf={bankTakesPdf(dialectId)} />

      <AccountAndFormatFields dialectId={dialectId} onBankChange={handleBankChange} />

      {accountId && !hasNoFormat && !isLive && (
        <UploadFileSection
          files={files}
          rows={rows}
          dialectId={dialectId}
          formatMismatch={formatMismatch}
          pdfStatement={pdfStatement}
          handleFilesSelect={handleFilesSelect}
          handleDismissMismatch={handleDismissMismatch}
        />
      )}

      {error && (
        <div className="p-4 text-sm text-destructive bg-destructive/10 dark:text-destructive/40 rounded-lg">
          {error}
        </div>
      )}

      {!isLive && (
        <UploadFooter
          onNext={handleNext}
          disabled={
            !accountId || hasNoFormat || (files.length === 0 && rows.length === 0) || isProcessing
          }
          isProcessing={isProcessing}
          pdfStatement={pdfStatement}
        />
      )}
    </div>
  );
}
