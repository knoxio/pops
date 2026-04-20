/**
 * FileUpload — drag-and-drop file input primitive for single or multi-file uploads.
 *
 * Handles drop target, accept filter, size validation, and renders an optional
 * list of selected files with a simple preview. Domain-specific behaviour
 * (CSV parsing, image preprocessing) stays with the consumer through the
 * onFilesSelected callback.
 */
import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useCallback,
  useId,
  useRef,
  useState,
} from 'react';

import { cn } from '../lib/utils';
import { DropZone, FileList } from './FileUpload.parts';
import { validateFiles } from './FileUpload.utils';

export interface FileUploadProps {
  multiple?: boolean;
  accept?: string;
  maxSize?: number;
  maxFiles?: number;
  onFilesSelected: (files: File[]) => void;
  onError?: (message: string) => void;
  files?: File[];
  onRemoveFile?: (index: number) => void;
  captureSlot?: ReactNode;
  prompt?: ReactNode;
  disabled?: boolean;
  className?: string;
}

interface FileHandlers {
  handleDrop: (e: DragEvent<HTMLDivElement>) => void;
  handleChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

function useFileHandlers({
  multiple,
  accept,
  maxSize,
  maxFiles,
  onError,
  onFilesSelected,
  disabled,
  setIsDragging,
}: Pick<
  FileUploadProps,
  'multiple' | 'accept' | 'maxSize' | 'maxFiles' | 'onError' | 'onFilesSelected' | 'disabled'
> & {
  setIsDragging: (v: boolean) => void;
}): FileHandlers {
  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const arr = Array.from(list);
      const valid = validateFiles({
        list: multiple ? arr : arr.slice(0, 1),
        accept,
        maxSize,
        maxFiles,
        onError,
      });
      if (valid.length > 0) onFilesSelected(valid);
    },
    [multiple, accept, maxSize, maxFiles, onError, onFilesSelected]
  );
  return {
    handleDrop: (e) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      handleFiles(e.dataTransfer.files);
    },
    handleChange: (e) => {
      handleFiles(e.target.files);
      e.target.value = '';
    },
  };
}

export function FileUpload(props: FileUploadProps) {
  const {
    multiple = false,
    accept,
    onFilesSelected,
    onError,
    files,
    onRemoveFile,
    captureSlot,
    prompt,
    disabled,
    className,
    maxSize,
    maxFiles,
  } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const [isDragging, setIsDragging] = useState(false);
  const { handleDrop, handleChange } = useFileHandlers({
    multiple,
    accept,
    maxSize,
    maxFiles,
    onError,
    onFilesSelected,
    disabled,
    setIsDragging,
  });

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <DropZone
        inputRef={inputRef}
        inputId={inputId}
        isDragging={isDragging}
        setIsDragging={setIsDragging}
        disabled={disabled}
        multiple={multiple}
        accept={accept}
        prompt={prompt}
        onDrop={handleDrop}
        onChange={handleChange}
      />
      {captureSlot ? <div>{captureSlot}</div> : null}
      {files && files.length > 0 ? <FileList files={files} onRemoveFile={onRemoveFile} /> : null}
    </div>
  );
}
