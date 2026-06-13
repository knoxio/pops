import { FileText } from 'lucide-react';
import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery } from '@pops/pillar-sdk/react';
import { Skeleton } from '@pops/ui';

import { LinkDocumentDialog } from '../../../components/LinkDocumentDialog';
import { DocumentsBody, type LinkedDoc } from './DocumentsSection.parts';

interface DocumentsListResult {
  data: LinkedDoc[];
}

interface PaperlessStatusResult {
  data: {
    configured: boolean;
    available: boolean;
    baseUrl: string | null;
  } | null;
}

interface UnlinkInput {
  id: number;
}

function DocumentsList({
  itemId,
  paperlessBaseUrl,
}: {
  itemId: string;
  paperlessBaseUrl: string | null;
}) {
  const { data, isLoading } = usePillarQuery<DocumentsListResult>(
    'inventory',
    ['documents', 'listForItem'],
    { itemId }
  );

  const unlinkMutation = usePillarMutation<UnlinkInput, unknown>(
    'inventory',
    ['documents', 'unlink'],
    {
      onSuccess: () => {
        toast.success('Document unlinked');
      },
      onError: (err) => toast.error(`Failed to unlink: ${err.message}`),
    }
  );

  const docs = data?.data ?? [];

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documents
          {docs.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({docs.length})</span>
          )}
        </h2>
        <LinkDocumentDialog
          itemId={itemId}
          onLinked={() => {
            /* Pillar SDK auto-invalidates the `inventory.documents` router prefix on success. */
          }}
        />
      </div>
      <DocumentsBody
        isLoading={isLoading}
        docs={docs}
        paperlessBaseUrl={paperlessBaseUrl}
        onUnlink={(id) => unlinkMutation.mutate({ id })}
        isUnlinking={unlinkMutation.isPending}
      />
    </section>
  );
}

function DocumentsHeaderShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <FileText className="h-5 w-5" />
        Documents
      </h2>
      {children}
    </section>
  );
}

interface DocumentsSectionProps {
  itemId: string;
}

export function DocumentsSection({ itemId }: DocumentsSectionProps) {
  const { data: statusData, isLoading: statusLoading } = usePillarQuery<PaperlessStatusResult>(
    'inventory',
    ['paperless', 'status'],
    undefined
  );
  const status = statusData?.data;

  if (!statusLoading && !status?.configured) return null;
  if (statusLoading) {
    return (
      <DocumentsHeaderShell>
        <Skeleton className="h-12 w-full" />
      </DocumentsHeaderShell>
    );
  }
  if (!status?.available) {
    return (
      <DocumentsHeaderShell>
        <p className="text-sm text-muted-foreground">Paperless-ngx unavailable</p>
      </DocumentsHeaderShell>
    );
  }
  return <DocumentsList itemId={itemId} paperlessBaseUrl={status?.baseUrl ?? null} />;
}
