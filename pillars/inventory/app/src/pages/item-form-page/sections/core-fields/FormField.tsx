import { Label } from '@pops/ui';

interface FormFieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}

export function FormField({ label, error, children }: FormFieldProps) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  );
}
