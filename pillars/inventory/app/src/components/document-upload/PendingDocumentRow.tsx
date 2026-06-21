import { FileText, X } from 'lucide-react';

import { Button, formatBytes, Progress } from '@pops/ui';

import type { PendingDocumentFile } from '../DocumentUpload';

function FileStatus({ f }: { f: PendingDocumentFile }) {
  if (f.status === 'uploading') {
    return (
      <div className="mt-1 space-y-1">
        <Progress value={f.progress ?? 0} className="h-1.5" />
        <span className="text-xs text-muted-foreground">{f.progress ?? 0}%</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {f.status === 'done' && <span className="text-xs text-success">Uploaded</span>}
      {f.status === 'error' && (
        <span className="text-xs text-destructive">{f.error ?? 'Upload failed'}</span>
      )}
      {f.status === 'pending' && <span className="text-xs text-muted-foreground">Ready</span>}
      <span className="text-xs text-muted-foreground">{formatBytes(f.file.size)}</span>
    </div>
  );
}

export function PendingDocumentRow({
  f,
  onRemove,
}: {
  f: PendingDocumentFile;
  onRemove?: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border p-2">
      <div className="h-10 w-10 shrink-0 rounded bg-muted flex items-center justify-center">
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{f.file.name}</p>
        <FileStatus f={f} />
      </div>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => onRemove(f.localId)}
          aria-label={`Remove ${f.file.name}`}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
