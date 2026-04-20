import { ExternalLink, FileText, X } from 'lucide-react';
import { useState } from 'react';

import { Button, Skeleton } from '@pops/ui';

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  receipt: 'Receipts',
  warranty: 'Warranties',
  manual: 'Manuals',
  invoice: 'Invoices',
  other: 'Other',
};

export function DocumentThumbnail({ documentId }: { documentId: number }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const src = `/inventory/documents/${documentId}/thumbnail`;

  if (status === 'error') {
    return (
      <div
        className="h-12 w-10 rounded bg-muted flex items-center justify-center shrink-0"
        title="Document unavailable"
      >
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="h-12 w-10 shrink-0 relative">
      {status === 'loading' && <Skeleton className="absolute inset-0 rounded" />}
      <img
        src={src}
        alt="Document thumbnail"
        className="h-12 w-10 rounded object-cover"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </div>
  );
}

export type LinkedDoc = {
  id: number;
  documentType: string;
  paperlessDocumentId: number;
  title: string | null;
  createdAt: string | number | Date;
};

export function DocumentRow({
  doc,
  paperlessBaseUrl,
  onUnlink,
  isUnlinking,
}: {
  doc: LinkedDoc;
  paperlessBaseUrl: string | null;
  onUnlink: (id: number) => void;
  isUnlinking: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <DocumentThumbnail documentId={doc.paperlessDocumentId} />
        <div className="min-w-0 flex-1">
          <span className="font-medium text-sm truncate block">
            {doc.title ?? `Document #${doc.paperlessDocumentId}`}
          </span>
          <span className="text-xs text-muted-foreground">
            Linked {new Date(doc.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {paperlessBaseUrl && (
          <a
            href={`${paperlessBaseUrl}/documents/${doc.paperlessDocumentId}/details`}
            target="_blank"
            rel="noopener noreferrer"
            className="relative inline-flex items-center justify-center size-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent before:absolute before:content-[''] before:-inset-1"
            title="View in Paperless"
            aria-label="View in Paperless"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive shrink-0"
          onClick={() => onUnlink(doc.id)}
          disabled={isUnlinking}
          title="Unlink document"
          aria-label="Unlink document"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function groupDocumentsByType(docs: LinkedDoc[]) {
  const grouped = new Map<string, LinkedDoc[]>();
  for (const doc of docs) {
    const list = grouped.get(doc.documentType) ?? [];
    list.push(doc);
    grouped.set(doc.documentType, list);
  }
  const typeOrder = ['receipt', 'warranty', 'manual', 'invoice', 'other'];
  const sortedTypes = [...grouped.keys()].toSorted((a, b) => {
    const aIdx = typeOrder.indexOf(a);
    const bIdx = typeOrder.indexOf(b);
    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
  });
  return { grouped, sortedTypes };
}

export function DocumentsBody({
  isLoading,
  docs,
  paperlessBaseUrl,
  onUnlink,
  isUnlinking,
}: {
  isLoading: boolean;
  docs: LinkedDoc[];
  paperlessBaseUrl: string | null;
  onUnlink: (id: number) => void;
  isUnlinking: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (docs.length === 0) {
    return <p className="text-muted-foreground text-sm">No documents linked yet.</p>;
  }
  const { grouped, sortedTypes } = groupDocumentsByType(docs);
  return (
    <div className="space-y-4">
      {sortedTypes.map((type) => (
        <div key={type}>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            {DOCUMENT_TYPE_LABELS[type] ?? type}
          </h3>
          <div className="space-y-1.5">
            {grouped.get(type)?.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                paperlessBaseUrl={paperlessBaseUrl}
                onUnlink={onUnlink}
                isUnlinking={isUnlinking}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
