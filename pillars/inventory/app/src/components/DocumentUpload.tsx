import { useCallback, useRef, useState } from 'react';

import { cn } from '../lib/utils';
import { PendingDocumentRow } from './document-upload/PendingDocumentRow';
import { DropZone } from './photo-upload/DropZone';

/**
 * Pending in-flight upload entry tracked client-side. Distinct from
 * `UploadedFile` (used by `PhotoUpload`) because document uploads have no
 * thumbnail preview / pre-compression sizes — just the raw File and its
 * progress.
 */
export interface PendingDocumentFile {
  /** Client-side identifier for tracking. */
  localId: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  /** Upload progress 0–100. */
  progress?: number;
  /** Error message if `status === 'error'`. */
  error?: string;
}

interface DocumentUploadProps {
  /** Called when files are selected. Parent handles the actual upload. */
  onFilesSelected: (files: File[]) => void;
  /** Currently tracked files with their upload status. */
  files?: PendingDocumentFile[];
  /** Remove a file from the queue. */
  onRemove?: (localId: string) => void;
  /** Max file size in MB (default: 10). */
  maxSizeMb?: number;
  /** Accepted file types (default: PDF + image + plain text). */
  accept?: string;
  /** Whether uploads are currently in progress. */
  disabled?: boolean;
  className?: string;
}

const DEFAULT_MAX_SIZE_MB = 10;
const DEFAULT_ACCEPT =
  'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,text/plain,text/markdown,text/csv,.pdf,.txt,.md,.csv';

const ALLOWED_PREFIXES = ['application/pdf', 'image/', 'text/'];
const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png|webp|heic|heif|gif|txt|md|csv)$/i;

function isAllowedType(file: File): boolean {
  if (
    file.type &&
    ALLOWED_PREFIXES.some((p) => (p.endsWith('/') ? file.type.startsWith(p) : file.type === p))
  ) {
    return true;
  }
  // Some browsers report empty `type` for text uploads; fall back to extension.
  return ALLOWED_EXTENSIONS.test(file.name);
}

function validateFiles(fileList: File[], maxSizeMb: number): { valid: File[]; errors: string[] } {
  const maxBytes = maxSizeMb * 1024 * 1024;
  const valid: File[] = [];
  const errors: string[] = [];

  for (const file of fileList) {
    if (!isAllowedType(file)) {
      errors.push(`${file.name}: unsupported file type`);
      continue;
    }
    if (file.size > maxBytes) {
      errors.push(`${file.name}: exceeds ${maxSizeMb}MB limit`);
      continue;
    }
    valid.push(file);
  }
  return { valid, errors };
}

function useFileHandling(maxSizeMb: number, onFilesSelected: (files: File[]) => void) {
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const { valid, errors } = validateFiles(Array.from(fileList), maxSizeMb);
      setValidationError(errors.length > 0 ? errors.join(', ') : null);
      if (valid.length > 0) onFilesSelected(valid);
    },
    [maxSizeMb, onFilesSelected]
  );

  return { handleFiles, validationError };
}

export function DocumentUpload({
  onFilesSelected,
  files = [],
  onRemove,
  maxSizeMb = DEFAULT_MAX_SIZE_MB,
  accept = DEFAULT_ACCEPT,
  disabled = false,
  className,
}: DocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { handleFiles, validationError } = useFileHandling(maxSizeMb, onFilesSelected);

  return (
    <div className={cn('space-y-3', className)}>
      <DropZone
        disabled={disabled}
        maxSizeMb={maxSizeMb}
        onClick={() => !disabled && inputRef.current?.click()}
        onFiles={handleFiles}
        ariaLabel="Upload documents"
        helperText={`PDF, images, or text up to ${maxSizeMb}MB`}
      />
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        data-testid="document-upload-input"
        onChange={(e) => {
          handleFiles(e.target.files);
          if (inputRef.current) inputRef.current.value = '';
        }}
        className="hidden"
      />
      {validationError && <p className="text-sm text-destructive">{validationError}</p>}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f) => (
            <PendingDocumentRow key={f.localId} f={f} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}
