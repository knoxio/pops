// @pops/ui — public API barrel export

// Utilities
export { cn } from './lib/utils';
export { useDebouncedValue } from './lib/useDebounce';

// Primitives — non-conflicting exports
export * from './primitives/accordion';
export * from './primitives/alert';
export * from './primitives/alert-dialog';
export * from './primitives/avatar';
export * from './primitives/badge';
export * from './primitives/breadcrumb';
export * from './primitives/card';
export * from './primitives/checkbox';
export * from './primitives/collapsible';
export * from './primitives/command';
export * from './primitives/dialog';
export * from './primitives/input';
export * from './primitives/label';
export * from './primitives/popover';
export * from './primitives/progress';
export * from './primitives/radio-group';
export * from './primitives/separator';
export * from './primitives/skeleton';
export * from './primitives/slider';
export * from './primitives/sonner';
export * from './primitives/switch';
export * from './primitives/table';
export * from './primitives/tabs';
export * from './primitives/textarea';
export * from './primitives/tooltip';

// Primitives with naming conflicts — aliased to avoid collision with composites
// Import directly from "@pops/ui/primitives/button" etc. if primitive versions are needed
export { Button as ButtonPrimitive, buttonVariants } from './primitives/button';
export {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenu as DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './primitives/dropdown-menu';
export {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  Select as SelectPrimitive,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './primitives/select';

// Composite components
export * from './components/Autocomplete';
export * from './components/Button';
export * from './components/CheckboxInput';
export * from './components/Chip';
export * from './components/ChipInput';
export * from './components/ComboboxSelect';
export * from './components/DataTable';
export * from './components/DataTableFilters';
export * from './components/DateTimeInput';
export * from './components/DropdownMenu';
export * from './components/EditableCell';
export * from './components/ErrorBoundary';
export * from './components/InfiniteScrollTable';
export * from './components/NumberInput';
export * from './components/RadioInput';
export * from './components/Select';
export * from './components/StatCard';
export * from './components/TextInput';

// Layout composites
export * from './components/PageHeader';
export * from './components/ViewToggleGroup';

// Inventory composites
export * from './components/AssetIdBadge';
export * from './components/ConditionBadge';
export * from './components/LocationBreadcrumb';
export * from './components/TypeBadge';
export * from './components/WarrantyBadge';
