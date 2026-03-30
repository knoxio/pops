/**
 * LinkDocumentDialog — search Paperless-ngx and link a document to an inventory item.
 * Opens a dialog with search input, results with thumbnails, document type selector,
 * and link action per result.
 */
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  TextInput,
  Select,
  Skeleton,
} from "@pops/ui";
import { FileText, Search, Link2 } from "lucide-react";
import { trpc } from "../lib/trpc";

/** Shape of a document info result from the paperless search API. */
interface PaperlessDocResult {
  id: number;
  title: string;
  created: string;
  originalFileName: string;
  thumbnailUrl: string;
}

const DOCUMENT_TYPES = ["receipt", "warranty", "manual", "invoice", "other"] as const;

interface LinkDocumentDialogProps {
  itemId: string;
  onLinked: () => void;
}

export function LinkDocumentDialog({ itemId, onLinked }: LinkDocumentDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState<(typeof DOCUMENT_TYPES)[number]>("receipt");
  const [linkingId, setLinkingId] = useState<number | null>(null);

  const { data, isLoading } = trpc.inventory.paperless.search.useQuery(
    { query: search },
    { enabled: open && search.length >= 2 }
  );

  const linkMutation = trpc.inventory.documents.link.useMutation({
    onSuccess: () => {
      toast.success("Document linked");
      onLinked();
      setLinkingId(null);
      setOpen(false);
      setSearch("");
    },
    onError: (err) => {
      setLinkingId(null);
      if (err.data?.code === "CONFLICT") {
        toast.error("This document is already linked to this item");
      } else {
        toast.error(`Failed to link: ${err.message}`);
      }
    },
  });

  const handleLink = (docId: number, title: string) => {
    setLinkingId(docId);
    linkMutation.mutate({
      itemId,
      paperlessDocumentId: docId,
      documentType: docType,
      title,
    });
  };

  const results: PaperlessDocResult[] = data?.data ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setSearch("");
          setLinkingId(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-1.5" />
          Link Document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link Document</DialogTitle>
          <DialogDescription>
            Search Paperless-ngx for a document to link to this item.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents..."
              className="pl-9"
              autoFocus
            />
          </div>
          <Select
            value={docType}
            onChange={(e) => setDocType(e.target.value as typeof docType)}
            size="sm"
            options={DOCUMENT_TYPES.map((t) => ({
              value: t,
              label: t.charAt(0).toUpperCase() + t.slice(1),
            }))}
          />
        </div>

        <div className="max-h-72 overflow-y-auto space-y-1">
          {search.length < 2 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Type at least 2 characters to search
            </p>
          ) : isLoading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No documents found</p>
          ) : (
            results.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-2.5 rounded-md hover:bg-accent transition-colors"
              >
                {doc.thumbnailUrl ? (
                  <img
                    src={doc.thumbnailUrl}
                    alt=""
                    className="h-10 w-10 rounded object-cover shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{doc.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {doc.created ? new Date(doc.created).toLocaleDateString() : "No date"}
                    {doc.originalFileName ? ` · ${doc.originalFileName}` : ""}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleLink(doc.id, doc.title)}
                  disabled={linkMutation.isPending}
                >
                  {linkingId === doc.id ? (
                    <span className="text-xs">Linking...</span>
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
