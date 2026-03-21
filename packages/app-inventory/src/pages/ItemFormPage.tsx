/**
 * Item create/edit form page.
 * Supports /inventory/items/new (create) and /inventory/items/:id/edit (edit).
 */
import { useEffect, useState } from "react";
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
} from "@pops/ui";
import { ArrowLeft, Save, Link2, X, Search } from "lucide-react";
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

const CONDITIONS = ["Excellent", "Good", "Fair", "Poor"];

const defaultValues: ItemFormValues = {
  itemName: "",
  brand: "",
  model: "",
  itemId: "",
  type: "",
  condition: "",
  room: "",
  inUse: false,
  deductible: false,
  purchaseDate: "",
  warrantyExpires: "",
  replacementValue: "",
  resaleValue: "",
  assetId: "",
  notes: "",
};

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
    formState: { errors, isDirty },
  } = useForm<ItemFormValues>({ defaultValues });

  // Pending connections for create mode
  const [pendingConnections, setPendingConnections] = useState<
    PendingConnection[]
  >([]);
  const [connectionSearch, setConnectionSearch] = useState("");

  const { data: searchResults, isLoading: searchLoading } =
    trpc.inventory.items.list.useQuery(
      { search: connectionSearch, limit: 10 },
      { enabled: !isEditMode && connectionSearch.length >= 2 },
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
          toast.success(
            `Item created with ${connected} connection${connected > 1 ? "s" : ""}`,
          );
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
      replacementValue: values.replacementValue
        ? parseFloat(values.replacementValue)
        : null,
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
          <AlertDescription>
            {is404 ? "This item doesn't exist." : error.message}
          </AlertDescription>
        </Alert>
        <Link
          to="/inventory"
          className="mt-4 inline-block text-sm text-primary underline"
        >
          Back to inventory
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/inventory">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">
          {isEditMode ? "Edit Item" : "New Item"}
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Info */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Basic Information</h2>

          <FormField label="Item Name *" error={errors.itemName?.message}>
            <TextInput
              {...register("itemName", {
                required: "Item name is required",
              })}
              placeholder="e.g. MacBook Pro 16-inch"
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
            <FormField label="Asset ID">
              <TextInput {...register("assetId")} />
            </FormField>
          </div>
        </section>

        {/* Classification */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Classification</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Type">
              <Select
                {...register("type")}
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
                  ...CONDITIONS.map((c) => ({ value: c, label: c })),
                ]}
              />
            </FormField>
          </div>

          <FormField label="Room">
            <TextInput
              {...register("room")}
              placeholder="e.g. Office, Bedroom"
            />
          </FormField>

          <div className="flex gap-6">
            <CheckboxInput label="In Use" {...register("inUse")} />
            <CheckboxInput label="Tax Deductible" {...register("deductible")} />
          </div>
        </section>

        {/* Dates & Values */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Dates & Values</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Purchase Date">
              <DateInput {...register("purchaseDate")} />
            </FormField>
            <FormField label="Warranty Expires">
              <DateInput {...register("warrantyExpires")} />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Replacement Value ($)">
              <TextInput
                type="number"
                step="0.01"
                min="0"
                {...register("replacementValue")}
                placeholder="0.00"
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
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Notes</h2>
          <Textarea
            {...register("notes")}
            rows={4}
            placeholder="Add notes about this item..."
            className="w-full"
          />
        </section>

        {/* Connected Items (create mode only) */}
        {!isEditMode && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Connected Items
            </h2>

            {pendingConnections.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pendingConnections.map((conn) => (
                  <Badge
                    key={conn.id}
                    variant="secondary"
                    className="flex items-center gap-1.5 pl-3 pr-1.5 py-1"
                  >
                    {conn.itemName}
                    <button
                      type="button"
                      className="rounded-full p-0.5 hover:bg-muted"
                      onClick={() =>
                        setPendingConnections((prev) =>
                          prev.filter((c) => c.id !== conn.id),
                        )
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
                    const pendingIds = new Set(
                      pendingConnections.map((c) => c.id),
                    );
                    const filtered =
                      searchResults?.data.filter(
                        (item) => !pendingIds.has(item.id),
                      ) ?? [];
                    return filtered.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-3 text-center">
                        No items found
                      </p>
                    ) : (
                      filtered.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="w-full flex items-center justify-between p-2.5 hover:bg-accent text-left transition-colors"
                          onClick={() => {
                            setPendingConnections((prev) => [
                              ...prev,
                              { id: item.id, itemName: item.itemName },
                            ]);
                            setConnectionSearch("");
                          }}
                        >
                          <div>
                            <div className="font-medium text-sm">
                              {item.itemName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {[item.brand, item.model, item.assetId]
                                .filter(Boolean)
                                .join(" · ") || "No details"}
                            </div>
                          </div>
                          <Link2 className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
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
        <div className="flex gap-3 pt-4 border-t">
          <Button
            type="submit"
            loading={isMutating}
            loadingText={isEditMode ? "Saving..." : "Creating..."}
            prefix={<Save className="h-4 w-4" />}
          >
            {isEditMode ? "Save Changes" : "Create Item"}
          </Button>
          <Link to="/inventory">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
