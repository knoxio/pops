import { ExternalLink, FileText, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { Button, Skeleton } from '@pops/ui';

import { LinkDocumentDialog } from '../../../components/LinkDocumentDialog';

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  receipt: 'Receipts', warranty: 'Warranties', manual: 'Manuals', invoice: 'Invoices', other: 'Other',
};

function DocumentThumbnail({ documentId }: { documentId: number }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const src = `/inventory/documents/${documentId}/thumbnail`;

  if (status === 'error') {
    return (
      <div className="h-12 w-10 rounded bg-muted flex items-center justify-center shrink-0" title="Document unavailable">
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="h-12 w-10 shrink-0 relative">
      {status === 'loading' && <Skeleton className="absolute inset-0 rounded" />}
      <img src={src} alt="Document thumbnail" className="h-12 w-10 rounded object-cover" onLoad={() => setStatus('loaded')} onError={() => setStatus('error')} />
    </div>
  );
}

function DocumentsList({ itemId, paperlessBaseUrl }: { itemId: string; paperlessBaseUrl: string | null }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.inventory.documents.listForItem.useQuery({ itemId });

  const unlinkMutation = trpc.inventory.documents.unlink.useMutation({
    onSuccess: () => { toast.success('Document unlinked'); void utils.inventory.documents.listForItem.invalidate({ itemId }); },
    onError: (err: { message: string }) => toast.error(`Failed to unlink: ${err.message}`),
  });

  const docs = data?.data ?? [];
  const grouped = new Map<string, typeof docs>();
  for (const doc of docs) {
    const list = grouped.get(doc.documentType) ?? [];
    list.push(doc);
    grouped.set(doc.documentType, list);
  }
  const typeOrder = ['receipt', 'warranty', 'manual', 'invoice', 'other'];
  const sortedTypes = [...grouped.keys()].toSorted((a, b) => (typeOrder.indexOf(a) ?? 99) - (typeOrder.indexOf(b) ?? 99));

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documents
          {docs.length > 0 && <span className="text-sm font-normal text-muted-foreground">({docs.length})</span>}
        </h2>
        <LinkDocumentDialog itemId={itemId} onLinked={() => void utils.inventory.documents.listForItem.invalidate({ itemId })} />
      </div>
      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
      ) : docs.length > 0 ? (
        <div className="space-y-4">
          {sortedTypes.map((type) => (
            <div key={type}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">{DOCUMENT_TYPE_LABELS[type] ?? type}</h3>
              <div className="space-y-1.5">
                {grouped.get(type)?.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <DocumentThumbnail documentId={doc.paperlessDocumentId} />
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-sm truncate block">{doc.title ?? `Document #${doc.paperlessDocumentId}`}</span>
                        <span className="text-xs text-muted-foreground">Linked {new Date(doc.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {paperlessBaseUrl && (
                        <a href={`${paperlessBaseUrl}/documents/${doc.paperlessDocumentId}/details`} target="_blank" rel="noopener noreferrer" className="relative inline-flex items-center justify-center size-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent before:absolute before:content-[''] before:-inset-1" title="View in Paperless" aria-label="View in Paperless">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive shrink-0" onClick={() => unlinkMutation.mutate({ id: doc.id })} disabled={unlinkMutation.isPending} title="Unlink document" aria-label="Unlink document">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No documents linked yet.</p>
      )}
    </section>
  );
}

interface DocumentsSectionProps {
  itemId: string;
}

export function DocumentsSection({ itemId }: DocumentsSectionProps) {
  const { data: statusData, isLoading: statusLoading } = trpc.inventory.paperless.status.useQuery();
  const status = statusData?.data;

  if (!statusLoading && !status?.configured) return null;

  if (statusLoading) {
    return (
      <section className="mt-8">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><FileText className="h-5 w-5" />Documents</h2>
        <Skeleton className="h-12 w-full" />
      </section>
    );
  }

  if (!status?.available) {
    return (
      <section className="mt-8">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><FileText className="h-5 w-5" />Documents</h2>
        <p className="text-sm text-muted-foreground">Paperless-ngx unavailable</p>
      </section>
    );
  }

  return <DocumentsList itemId={itemId} paperlessBaseUrl={status?.baseUrl ?? null} />;
}
