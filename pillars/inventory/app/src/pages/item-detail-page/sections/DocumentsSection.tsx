import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';

import { Skeleton } from '@pops/ui';

import { LinkDocumentDialog } from '../../../components/LinkDocumentDialog';
import { unwrap } from '../../../inventory-api-helpers.js';
import {
  documentsListForItem,
  documentsUnlink,
  paperlessStatus,
} from '../../../inventory-api/index.js';
import { DocumentsBody } from './DocumentsSection.parts';

function DocumentsList({
  itemId,
  paperlessBaseUrl,
}: {
  itemId: string;
  paperlessBaseUrl: string | null;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'documents', 'listForItem', { itemId }],
    queryFn: async () => unwrap(await documentsListForItem({ path: { itemId } })),
  });

  const unlinkMutation = useMutation({
    mutationFn: async (input: { id: number }) =>
      unwrap(await documentsUnlink({ path: { id: input.id } })),
    onSuccess: () => {
      toast.success('Document unlinked');
    },
    onError: (err: Error) => toast.error(`Failed to unlink: ${err.message}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['inventory', 'documents'] }),
  });

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
            void queryClient.invalidateQueries({ queryKey: ['inventory', 'documents'] });
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
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['inventory', 'paperless', 'status'],
    queryFn: async () => unwrap(await paperlessStatus()),
  });
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
