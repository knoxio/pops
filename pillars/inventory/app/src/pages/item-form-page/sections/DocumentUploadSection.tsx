import { FileText } from 'lucide-react';

import { Button } from '@pops/ui';

import { DocumentList, type DocumentItem } from '../../../components/DocumentList';
import { DocumentUpload, type PendingDocumentFile } from '../../../components/DocumentUpload';

interface DocumentUploadSectionProps {
  isEditMode: boolean;
  existingDocuments: DocumentItem[];
  uploadFiles: PendingDocumentFile[];
  deleteConfirmId: number | null;
  isDeleting: boolean;
  isUploading: boolean;
  onFilesSelected: (files: File[]) => Promise<void>;
  onRemoveUpload: (localId: string) => void;
  onDeleteDocument: (id: number) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

export function DocumentUploadSection({
  isEditMode,
  existingDocuments,
  uploadFiles,
  deleteConfirmId,
  isDeleting,
  isUploading,
  onFilesSelected,
  onRemoveUpload,
  onDeleteDocument,
  onConfirmDelete,
  onCancelDelete,
}: DocumentUploadSectionProps) {
  return (
    <section
      className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5"
      data-testid="document-upload-section"
    >
      <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
        <FileText className="h-5 w-5 text-app-accent" />
        Documents
      </h2>

      {!isEditMode && (
        <p className="text-sm text-muted-foreground">
          Save the item first to start attaching documents.
        </p>
      )}

      {isEditMode && <DocumentList documents={existingDocuments} onDelete={onDeleteDocument} />}

      {deleteConfirmId !== null && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm flex-1">Delete this document? This cannot be undone.</p>
          <Button type="button" variant="outline" size="sm" onClick={onCancelDelete}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-destructive text-white hover:bg-destructive/80"
            onClick={onConfirmDelete}
            loading={isDeleting}
            loadingText="Deleting..."
          >
            Delete
          </Button>
        </div>
      )}

      {isEditMode && (
        <DocumentUpload
          onFilesSelected={(files) => void onFilesSelected(files)}
          files={uploadFiles}
          onRemove={onRemoveUpload}
          disabled={isUploading}
        />
      )}
    </section>
  );
}
