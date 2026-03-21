/**
 * Inventory items list page — placeholder for PRD-019/US-2.
 */
import { Package } from "lucide-react";

export function ItemsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold">Inventory</h1>
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
        <Package className="h-12 w-12" />
        <p>Item list coming soon.</p>
      </div>
    </div>
  );
}
