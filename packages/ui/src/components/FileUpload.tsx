/**
 * FileUpload — drag-and-drop file input primitive for single or multi-file uploads.
 *
 * Handles drop target, accept filter, size validation, and renders an optional
 * list of selected files with a simple preview. Domain-specific behaviour
 * (CSV parsing, image preprocessing) stays with the consumer through the
 * onFilesSelected callback.
 */
import { Upload, X } from 'lucide-react';
import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useCallback,
  useId,
  useRef,
  useState,
} from 'react';

import { formatBytes } from '../lib/format';
import { cn } from '../lib/utils';
import { Button } from '../primitives/button';

export interface FileUploadProps {
  /** Whether multiple files can be selected. Default `false`. */
  multiple?: boolean;
  /** Accept attribute / MIME filter passed to the native input. */
  accept?: string;
  /** Max size per file, in bytes. Files over this are rejected. */
  maxSize?: number;
  /** Max number of files when `multiple`. */
  maxFiles?: number;
  /** Called whenever the user picks files that pass validation. */
  onFilesSelected: (files: File[]) => void;
  /** Called when a user-visible validation error occurs. */
  onError?: (message: string) => void;
  /** Currently selected/pending files, rendered as a simple list. */
  files?: File[];
  /** Remove-one handler; if provided, a delete button renders per file. */
  onRemoveFile?: (index: number) => void;
  /** Slot for a camera-capture button (mobile image flows). */
  captureSlot?: ReactNode;
  /** Override the prompt text in the drop zone. */
  prompt?: ReactNode;
  /** Disable the entire control. */
  disabled?: boolean;
  className?: string;
}

export function FileUpload({
  multiple = false,
  accept,
  maxSize,
  maxFiles,
  onFilesSelected,
  onError,
  files,
  onRemoveFile,
  captureSlot,
  prompt,
  disabled,
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const [isDragging, setIsDragging] = useState(false);

  const validate = useCallback(
    (list: File[]): File[] => {
      const out: File[] = [];
      for (const file of list) {
        if (typeof maxSize === 'number' && file.size > maxSize) {
          onError?.(`${file.name} exceeds max size of ${formatBytes(maxSize)}`);
          continue;
        }
        out.push(file);
      }
      if (typeof maxFiles === 'number' && out.length > maxFiles) {
        onError?.(`You can upload at most ${maxFiles} file${maxFiles === 1 ? '' : 's'}`);
        return out.slice(0, maxFiles);
      }
      return out;
    },
    [maxSize, maxFiles, onError]
  );

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const arr = Array.from(list);
      const valid = validate(multiple ? arr : arr.slice(0, 1));
      if (valid.length > 0) onFilesSelected(valid);
    },
    [multiple, onFilesSelected, validate]
  );

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // Reset so the same file can be selected again after removal.
    e.target.value = '';
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-input bg-background p-8 text-center transition-colors',
          'hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isDragging && 'border-ring bg-accent/40',
          disabled && 'opacity-50 pointer-events-none'
        )}
      >
        <Upload className="h-8 w-8 text-muted-foreground" aria-hidden />
        <div className="text-sm font-medium">
          {prompt ?? <>Drag {multiple ? 'files' : 'a file'} here, or click to browse</>}
        </div>
        {accept ? <div className="text-xs text-muted-foreground">Accepts {accept}</div> : null}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={handleChange}
          className="sr-only"
        />
      </div>
      {captureSlot ? <div>{captureSlot}</div> : null}
      {files && files.length > 0 ? (
        <ul className="flex flex-col gap-1.5 text-sm">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">{formatBytes(file.size)}</div>
              </div>
              {onRemoveFile ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onRemoveFile(i)}
                  aria-label={`Remove ${file.name}`}
                >
                  <X />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
