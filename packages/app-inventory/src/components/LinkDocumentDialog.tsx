import { FileText, Link2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { Button, SearchPickerDialog, Select } from '@pops/ui';

interface PaperlessDocResult {
  id: number;
  title: string;
  created: string;
  originalFileName: string;
  thumbnailUrl: string;
}

const DOCUMENT_TYPES = ['receipt', 'warranty', 'manual', 'invoice', 'other'] as const;

interface LinkDocumentDialogProps {
  itemId: string;
  onLinked: () => void;
}

interface DocumentResultRowProps {
  doc: PaperlessDocResult;
  linkingId: number | null;
  isPending: boolean;
  onLink: (doc: PaperlessDocResult) => void;
}

function DocumentResultRow({ doc, linkingId, isPending, onLink }: DocumentResultRowProps) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-md hover:bg-accent transition-colors">
      {doc.thumbnailUrl ? (
        <img src={doc.thumbnailUrl} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
      ) : (
        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{doc.title}</div>
        <div className="text-xs text-muted-foreground">
          {doc.created ? new Date(doc.created).toLocaleDateString() : 'No date'}
          {doc.originalFileName ? ` · ${doc.originalFileName}` : ''}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onLink(doc)} disabled={isPending}>
        {linkingId === doc.id ? (
          <span className="text-xs">Linking...</span>
        ) : (
          <Link2 className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

type DocType = (typeof DOCUMENT_TYPES)[number];

const DOC_TYPE_OPTIONS = DOCUMENT_TYPES.map((t) => ({
  value: t,
  label: t.charAt(0).toUpperCase() + t.slice(1),
}));

const TRIGGER = (
  <Button variant="outline" size="sm">
    <FileText className="h-4 w-4 mr-1.5" />
    Link Document
  </Button>
);

function DocTypeSelect({
  docType,
  setDocType,
}: {
  docType: DocType;
  setDocType: (v: DocType) => void;
}) {
  return (
    <Select
      value={docType}
      onChange={(e) => setDocType(e.target.value as DocType)}
      size="sm"
      options={DOC_TYPE_OPTIONS}
    />
  );
}

function useLinkDocumentMutation(
  onLinked: () => void,
  setOpen: (v: boolean) => void,
  setSearch: (v: string) => void,
  setLinkingId: (v: number | null) => void
) {
  return trpc.inventory.documents.link.useMutation({
    onSuccess: () => {
      toast.success('Document linked');
      onLinked();
      setLinkingId(null);
      setOpen(false);
      setSearch('');
    },
    onError: (err) => {
      setLinkingId(null);
      if (err.data?.code === 'CONFLICT') {
        toast.error('This document is already linked to this item');
      } else {
        toast.error(`Failed to link: ${err.message}`);
      }
    },
  });
}

export function LinkDocumentDialog({ itemId, onLinked }: LinkDocumentDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [docType, setDocType] = useState<DocType>('receipt');
  const [linkingId, setLinkingId] = useState<number | null>(null);

  const { data, isLoading } = trpc.inventory.paperless.search.useQuery(
    { query: search },
    { enabled: open && search.length >= 2 }
  );
  const linkMutation = useLinkDocumentMutation(onLinked, setOpen, setSearch, setLinkingId);
  const results: PaperlessDocResult[] = data?.data ?? [];

  return (
    <SearchPickerDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setSearch('');
          setLinkingId(null);
        }
      }}
      trigger={TRIGGER}
      title="Link Document"
      description="Search Paperless-ngx for a document to link to this item."
      searchPlaceholder="Search documents..."
      search={search}
      onSearchChange={setSearch}
      isLoading={isLoading}
      results={results}
      getResultKey={(doc: PaperlessDocResult) => doc.id}
      maxResultsHeight="max-h-72"
      trailing={<DocTypeSelect docType={docType} setDocType={setDocType} />}
      renderResult={(doc: PaperlessDocResult) => (
        <DocumentResultRow
          doc={doc}
          linkingId={linkingId}
          isPending={linkMutation.isPending}
          onLink={(d) => {
            setLinkingId(d.id);
            linkMutation.mutate({
              itemId,
              paperlessDocumentId: d.id,
              documentType: docType,
              title: d.title,
            });
          }}
        />
      )}
    />
  );
}
