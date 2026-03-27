/**
 * Item create/edit form page.
 * Supports /inventory/items/new (create) and /inventory/items/:id/edit (edit).
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Button,
  TextInput,
  Select,
  CheckboxInput,
  DateInput,
  Textarea,
  Alert,
  AlertTitle,
  AlertDescription,
  Skeleton,
  Badge,
  PageHeader,
} from "@pops/ui";
import { Save, Link2, X, Search, Wand2, Loader2, Eye, Pencil } from "lucide-react";
import { trpc } from "../lib/trpc";

interface PendingConnection {
  id: string;
  itemName: string;
}

interface ItemFormValues {
  itemName: string;
  brand: string;
  model: string;
  itemId: string;
  type: string;
  condition: string;
  room: string;
  inUse: boolean;
  deductible: boolean;
  purchaseDate: string;
  warrantyExpires: string;
  purchasePrice: string;
  replacementValue: string;
  resaleValue: string;
  assetId: string;
  notes: string;
}

const ITEM_TYPES = [
  "Electronics",
  "Furniture",
  "Appliance",
  "Clothing",
  "Tools",
  "Sports",
  "Kitchen",
  "Office",
  "Other",
];

const CONDITIONS = [
  { value: "New", label: "New" },
  { value: "Excellent", label: "Excellent" },
  { value: "Good", label: "Good" },
  { value: "Fair", label: "Fair" },
  { value: "Poor", label: "Poor" },
  { value: "Broken", label: "Broken" },
];

const defaultValues: ItemFormValues = {
  itemName: "",
  brand: "",
  model: "",
  itemId: "",
  type: "",
  condition: "Good",
  room: "",
  inUse: false,
  deductible: false,
  purchaseDate: "",
  warrantyExpires: "",
  purchasePrice: "",
  replacementValue: "",
  resaleValue: "",
  assetId: "",
  notes: "",
};

/** Extract a 4-6 character uppercase prefix from an item type for asset ID generation. */
export function extractPrefix(type: string): string {
  const firstWord = type.split(/\s+/)[0] ?? "";
  const upper = firstWord.toUpperCase();
  // Truncate to 4 chars, unless the word is 5-6 chars — keep up to 6
  return upper.length <= 6 ? upper : upper.slice(0, 4);
}

/** Simple markdown-to-HTML for notes preview (bold, italic, links, lists, line breaks). */
function renderBasicMarkdown(text: string): string {
  if (!text) return '<p class="text-muted-foreground">No notes yet.</p>';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-medium mb-1.5 block">{label}</label>
      {children}
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  );
}

export function ItemFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<ItemFormValues>({ defaultValues });

  const typeValue = watch("type");

  // Asset ID uniqueness validation
  const [assetIdError, setAssetIdError] = useState<string | null>(null);
  const [assetIdChecking, setAssetIdChecking] = useState(false);
  const [generating, setGenerating] = useState(false);

  const validateAssetIdUniqueness = useCallback(
    async (value: string) => {
      if (!value.trim()) {
        setAssetIdError(null);
        return;
      }
      setAssetIdChecking(true);
      try {
        const result = await utils.inventory.items.searchByAssetId.fetch({
          assetId: value.trim(),
        });
        if (result.data && result.data.id !== id) {
          setAssetIdError(`Asset ID already in use by ${result.data.itemName}`);
        } else {
          setAssetIdError(null);
        }
      } catch {
        setAssetIdError(null);
      } finally {
        setAssetIdChecking(false);
      }
    },
    [id, utils]
  );

  const handleAutoGenerate = useCallback(async () => {
    if (!typeValue) return;
    setGenerating(true);
    try {
      const prefix = extractPrefix(typeValue);
      const result = await utils.inventory.items.countByAssetPrefix.fetch({ prefix });
      const nextNum = result.data + 1;
      const padded = nextNum >= 100 ? String(nextNum) : String(nextNum).padStart(2, "0");
      const newAssetId = `${prefix}${padded}`;
      setValue("assetId", newAssetId, { shouldDirty: true });
      setAssetIdError(null);
      void validateAssetIdUniqueness(newAssetId);
    } catch {
      toast.error("Failed to generate asset ID");
    } finally {
      setGenerating(false);
    }
  }, [typeValue, utils, setValue, validateAssetIdUniqueness]);

  const [notesPreview, setNotesPreview] = useState(false);

  // Pending connections for create mode
  const [pendingConnections, setPendingConnections] = useState<PendingConnection[]>([]);
  const [connectionSearch, setConnectionSearch] = useState("");

  const { data: searchResults, isLoading: searchLoading } = trpc.inventory.items.list.useQuery(
    { search: connectionSearch, limit: 10 },
    { enabled: !isEditMode && connectionSearch.length >= 2 }
  );

  const connectMutation = trpc.inventory.connections.connect.useMutation();

  // Fetch existing item for edit mode
  const {
    data: itemData,
    isLoading,
    error,
  } = trpc.inventory.items.get.useQuery({ id: id! }, { enabled: isEditMode });

  // Populate form when item loads
  useEffect(() => {
    if (itemData?.data) {
      const item = itemData.data;
      reset({
        itemName: item.itemName,
        brand: item.brand ?? "",
        model: item.model ?? "",
        itemId: item.itemId ?? "",
        type: item.type ?? "",
        condition: item.condition ?? "",
        room: item.room ?? "",
        inUse: item.inUse,
        deductible: item.deductible,
        purchaseDate: item.purchaseDate ?? "",
        warrantyExpires: item.warrantyExpires ?? "",
        purchasePrice: item.purchasePrice?.toString() ?? "",
        replacementValue: item.replacementValue?.toString() ?? "",
        resaleValue: item.resaleValue?.toString() ?? "",
        assetId: item.assetId ?? "",
        notes: item.notes ?? "",
      });
    }
  }, [itemData, reset]);

  // Unsaved changes warning
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const createMutation = trpc.inventory.items.create.useMutation({
    onSuccess: async (result) => {
      const newItemId = result.data.id;

      // Create pending connections sequentially
      if (pendingConnections.length > 0) {
        let connected = 0;
        for (const conn of pendingConnections) {
          try {
            await connectMutation.mutateAsync({
              itemAId: newItemId,
              itemBId: conn.id,
            });
            connected++;
          } catch {
            // Skip failed connections (e.g. conflict)
          }
        }
        if (connected > 0) {
          toast.success(`Item created with ${connected} connection${connected > 1 ? "s" : ""}`);
        } else {
          toast.success("Item created");
        }
      } else {
        toast.success("Item created");
      }

      void utils.inventory.items.list.invalidate();
      navigate("/inventory");
    },
    onError: (err) => {
      toast.error(`Failed to create: ${err.message}`);
    },
  });

  const updateMutation = trpc.inventory.items.update.useMutation({
    onSuccess: () => {
      toast.success("Item updated");
      void utils.inventory.items.list.invalidate();
      void utils.inventory.items.get.invalidate({ id: id! });
      navigate(`/inventory/items/${id}`);
    },
    onError: (err) => {
      toast.error(`Failed to update: ${err.message}`);
    },
  });

  const onSubmit = (values: ItemFormValues) => {
    if (!values.itemName.trim()) {
      toast.error("Item name is required");
      return;
    }
    if (!values.type) {
      toast.error("Type is required");
      return;
    }

    const payload = {
      itemName: values.itemName.trim(),
      brand: values.brand || null,
      model: values.model || null,
      itemId: values.itemId || null,
      type: values.type || null,
      condition: values.condition || null,
      room: values.room || null,
      inUse: values.inUse,
      deductible: values.deductible,
      purchaseDate: values.purchaseDate || null,
      warrantyExpires: values.warrantyExpires || null,
      purchasePrice: values.purchasePrice ? parseFloat(values.purchasePrice) : null,
      replacementValue: values.replacementValue ? parseFloat(values.replacementValue) : null,
      resaleValue: values.resaleValue ? parseFloat(values.resaleValue) : null,
      assetId: values.assetId || null,
      notes: values.notes || null,
    };

    if (isEditMode) {
      updateMutation.mutate({ id: id!, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  if (isEditMode && isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-2xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isEditMode && error) {
    const is404 = error.data?.code === "NOT_FOUND";
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>{is404 ? "Item not found" : "Error"}</AlertTitle>
          <AlertDescription>{is404 ? "This item doesn't exist." : error.message}</AlertDescription>
        </Alert>
        <Link
          to="/inventory"
          className="mt-4 inline-block text-sm text-app-accent hover:text-app-accent/80 underline font-medium"
        >
          Back to inventory
        </Link>
      </div>
    );
  }

  const editItemName = itemData?.data?.itemName;

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader
        title={isEditMode ? "Edit Item" : "New Item"}
        backHref={isEditMode && id ? `/inventory/items/${id}` : "/inventory"}
        breadcrumbs={
          isEditMode && editItemName
            ? [
                { label: "Inventory", href: "/inventory" },
                { label: editItemName, href: `/inventory/items/${id}` },
                { label: "Edit" },
              ]
            : [{ label: "Inventory", href: "/inventory" }, { label: "New Item" }]
        }
        renderLink={Link}
        className="mb-8"
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Basic Info */}
        <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
          <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
            Basic Information
          </h2>

          <FormField label="Item Name *" error={errors.itemName?.message}>
            <TextInput
              {...register("itemName", {
                required: "Item name is required",
              })}
              placeholder="e.g. MacBook Pro 16-inch"
              className="font-semibold"
            />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Brand">
              <TextInput {...register("brand")} placeholder="e.g. Apple" />
            </FormField>
            <FormField label="Model">
              <TextInput {...register("model")} placeholder="e.g. M3 Max" />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Item ID / SKU">
              <TextInput {...register("itemId")} />
            </FormField>
            <FormField label="Asset ID" error={assetIdError ?? undefined}>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <TextInput
                    {...register("assetId")}
                    className="font-mono"
                    onBlur={(e) => void validateAssetIdUniqueness(e.target.value)}
                  />
                  {assetIdChecking && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!typeValue || generating}
                  onClick={() => void handleAutoGenerate()}
                  className="shrink-0 whitespace-nowrap"
                  title={
                    typeValue ? `Generate ${extractPrefix(typeValue)}XX` : "Select a type first"
                  }
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4 mr-1" />
                  )}
                  Auto-generate
                </Button>
              </div>
            </FormField>
          </div>
        </section>

        {/* Classification */}
        <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
          <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
            Classification
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Type *" error={errors.type?.message}>
              <Select
                {...register("type", { required: "Type is required" })}
                options={[
                  { value: "", label: "Select type..." },
                  ...ITEM_TYPES.map((t) => ({ value: t, label: t })),
                ]}
              />
            </FormField>
            <FormField label="Condition">
              <Select
                {...register("condition")}
                options={[
                  { value: "", label: "Select condition..." },
                  ...CONDITIONS.map((c) => ({ value: c.value, label: c.label })),
                ]}
              />
            </FormField>
          </div>

          <FormField label="Room">
            <TextInput {...register("room")} placeholder="e.g. Office, Bedroom" />
          </FormField>

          <div className="flex gap-6 p-4 rounded-xl bg-app-accent/5">
            <CheckboxInput label="In Use" {...register("inUse")} />
            <CheckboxInput label="Tax Deductible" {...register("deductible")} />
          </div>
        </section>

        {/* Dates & Values */}
        <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
          <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
            Dates & Values
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Purchase Date">
              <DateInput {...register("purchaseDate")} />
            </FormField>
            <FormField label="Warranty Expires">
              <DateInput {...register("warrantyExpires")} />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Purchase Price ($)">
              <TextInput
                type="number"
                step="0.01"
                min="0"
                {...register("purchasePrice")}
                placeholder="0.00"
              />
            </FormField>
            <FormField label="Replacement Value ($)">
              <TextInput
                type="number"
                step="0.01"
                min="0"
                {...register("replacementValue")}
                placeholder="0.00"
                className="font-bold text-app-accent"
              />
            </FormField>
            <FormField label="Resale Value ($)">
              <TextInput
                type="number"
                step="0.01"
                min="0"
                {...register("resaleValue")}
                placeholder="0.00"
              />
            </FormField>
          </div>
        </section>

        {/* Notes */}
        <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
              Notes
            </h2>
            <button
              type="button"
              onClick={() => setNotesPreview((p) => !p)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label={notesPreview ? "Edit notes" : "Preview notes"}
            >
              {notesPreview ? (
                <>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" /> Preview
                </>
              )}
            </button>
          </div>
          {notesPreview ? (
            <div
              className="prose prose-sm dark:prose-invert max-w-none min-h-[6rem] p-3 rounded-md border bg-muted/30"
              aria-label="Notes preview"
              dangerouslySetInnerHTML={{
                __html: renderBasicMarkdown(watch("notes") || ""),
              }}
            />
          ) : (
            <Textarea
              {...register("notes")}
              rows={4}
              placeholder="Add notes about this item..."
              className="w-full bg-transparent"
            />
          )}
        </section>

        {/* Connected Items (create mode only) */}
        {!isEditMode && (
          <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
            <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Link2 className="h-5 w-5 text-app-accent" />
              Connected Items
            </h2>

            {pendingConnections.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pendingConnections.map((conn) => (
                  <Badge
                    key={conn.id}
                    variant="secondary"
                    className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 bg-app-accent/10 text-app-accent border-app-accent/20"
                  >
                    {conn.itemName}
                    <button
                      type="button"
                      className="rounded-full p-0.5 hover:bg-app-accent/20"
                      onClick={() =>
                        setPendingConnections((prev) => prev.filter((c) => c.id !== conn.id))
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <TextInput
                value={connectionSearch}
                onChange={(e) => setConnectionSearch(e.target.value)}
                placeholder="Search items to connect..."
                className="pl-9"
              />
            </div>

            {connectionSearch.length >= 2 && (
              <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                {searchLoading ? (
                  <div className="space-y-2 p-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  (() => {
                    const pendingIds = new Set(pendingConnections.map((c) => c.id));
                    const filtered =
                      searchResults?.data.filter((item) => !pendingIds.has(item.id)) ?? [];
                    return filtered.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-3 text-center">
                        No items found
                      </p>
                    ) : (
                      filtered.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="w-full flex items-center justify-between p-2.5 hover:bg-app-accent/5 text-left transition-colors"
                          onClick={() => {
                            setPendingConnections((prev) => [
                              ...prev,
                              { id: item.id, itemName: item.itemName },
                            ]);
                            setConnectionSearch("");
                          }}
                        >
                          <div>
                            <div className="font-medium text-sm">{item.itemName}</div>
                            <div className="text-xs text-muted-foreground">
                              {[item.brand, item.model, item.assetId].filter(Boolean).join(" · ") ||
                                "No details"}
                            </div>
                          </div>
                          <Link2 className="h-4 w-4 text-app-accent/50 shrink-0 ml-2" />
                        </button>
                      ))
                    );
                  })()
                )}
              </div>
            )}
          </section>
        )}

        {/* Actions */}
        <div className="flex gap-4 pt-6 border-t">
          <Button
            type="submit"
            size="lg"
            className="flex-1 bg-app-accent hover:bg-app-accent/80 text-white font-bold transition-all shadow-md shadow-app-accent/20"
            loading={isMutating}
            loadingText={isEditMode ? "Saving..." : "Creating..."}
          >
            <Save className="h-5 w-5 mr-2" />
            {isEditMode ? "Save Changes" : "Create Item"}
          </Button>
          <Link to="/inventory">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="px-8 font-bold border-app-accent/20 hover:bg-app-accent/5"
            >
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
