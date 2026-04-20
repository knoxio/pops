import { Upload, X } from 'lucide-react';
import { type ChangeEvent, type DragEvent, type ReactNode } from 'react';

import { formatBytes } from '../lib/format';
import { cn } from '../lib/utils';
import { Button } from '../primitives/button';

export interface DropZoneProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  inputId: string;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  disabled?: boolean;
  multiple: boolean;
  accept?: string;
  prompt?: ReactNode;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

export function DropZone({
  inputRef,
  inputId,
  isDragging,
  setIsDragging,
  disabled,
  multiple,
  accept,
  prompt,
  onDrop,
  onChange,
}: DropZoneProps) {
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled ?? undefined}
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
      onDrop={onDrop}
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
        onChange={onChange}
        className="sr-only"
      />
    </div>
  );
}

export interface FileListProps {
  files: File[];
  onRemoveFile?: (index: number) => void;
}

export function FileList({ files, onRemoveFile }: FileListProps) {
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {files.map((file, i) => (
        <li
          key={`${file.name}-${file.size}-${file.lastModified}`}
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
  );
}
