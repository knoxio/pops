import { Download, FileText, Trash2 } from 'lucide-react';

import { Button, formatBytes, formatDate } from '@pops/ui';

export interface DocumentItem {
  id: number;
  itemId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}

interface DocumentListProps {
  documents: DocumentItem[];
  onDelete?: (id: number) => void;
  /** Base URL prefix for download links (default: "/api/inventory/documents"). */
  baseUrl?: string;
}

/**
 * Encode each path segment individually so slashes survive the URL —
 * `encodeURIComponent(filePath)` would turn `items/{id}/file_001.pdf` into
 * `items%2F{id}%2Ffile_001.pdf`, which Express routes as a single segment.
 */
function buildDownloadHref(baseUrl: string, filePath: string): string {
  return `${baseUrl}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center py-8 text-muted-foreground"
      data-testid="document-list-empty"
    >
      <FileText className="h-12 w-12 mb-2 opacity-30" />
      <p className="text-sm">No documents yet</p>
    </div>
  );
}

function DocumentRow({
  doc,
  href,
  onDelete,
}: {
  doc: DocumentItem;
  href: string;
  onDelete?: (id: number) => void;
}) {
  return (
    <li
      role="listitem"
      aria-label={`Document ${doc.fileName}`}
      className="flex items-center gap-3 rounded-md border border-border p-3"
      data-testid="document-row"
      data-document-id={doc.id}
    >
      <div className="h-10 w-10 shrink-0 rounded bg-muted flex items-center justify-center">
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" title={doc.fileName}>
          {doc.fileName}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDate(doc.uploadedAt, 'medium')} · {formatBytes(doc.fileSize)}
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <a
          href={href}
          download={doc.fileName}
          aria-label={`Download ${doc.fileName}`}
          data-testid="document-download-link"
        >
          <Download className="h-4 w-4 mr-1.5" />
          Download
        </a>
      </Button>
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onDelete(doc.id)}
          aria-label={`Delete document ${doc.fileName}`}
          data-testid="document-delete-button"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      )}
    </li>
  );
}

export function DocumentList({
  documents,
  onDelete,
  baseUrl = '/api/inventory/documents',
}: DocumentListProps) {
  if (documents.length === 0) return <EmptyState />;

  return (
    <ul className="space-y-2" data-testid="document-list">
      {documents.map((doc) => (
        <DocumentRow
          key={doc.id}
          doc={doc}
          href={buildDownloadHref(baseUrl, doc.filePath)}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
