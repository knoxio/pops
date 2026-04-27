/**
 * TemplateFields — dynamically renders form fields based on a template's
 * `custom_fields` definition.
 *
 * Supports: string, number, boolean, string[], number[], boolean[].
 * No hardcoded template-specific logic — everything is driven by the
 * template schema.
 */
import { ChipInput, TextInput } from '@pops/ui';

interface TemplateFieldDef {
  type: string;
  description: string;
}

interface TemplateFieldsProps {
  /** custom_fields map from the selected template. */
  fields: Record<string, TemplateFieldDef>;
  /** Current values for each field. */
  values: Record<string, unknown>;
  /** Called when a field value changes. */
  onChange: (fieldName: string, value: unknown) => void;
  /** Field names that are required by the template. */
  requiredFields?: string[];
}

function StringField({
  name,
  def,
  value,
  required,
  onChange,
}: {
  name: string;
  def: TemplateFieldDef;
  value: unknown;
  required: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <TextInput
      label={name}
      placeholder={def.description}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      aria-label={name}
      aria-required={required}
    />
  );
}

function NumberField({
  name,
  def,
  value,
  onChange,
}: {
  name: string;
  def: TemplateFieldDef;
  value: unknown;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest ml-1">
        {name}
      </label>
      <input
        type="number"
        className="border border-border bg-background rounded-md px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-ring"
        placeholder={def.description}
        value={typeof value === 'number' ? value : ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        aria-label={name}
      />
    </div>
  );
}

function BooleanField({
  name,
  def,
  value,
  onChange,
}: {
  name: string;
  def: TemplateFieldDef;
  value: unknown;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 min-h-11 cursor-pointer">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-border text-primary accent-primary"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={name}
      />
      <div className="flex flex-col">
        <span className="text-sm font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">{def.description}</span>
      </div>
    </label>
  );
}

function ArrayField({
  name,
  def,
  value,
  onChange,
}: {
  name: string;
  def: TemplateFieldDef;
  value: unknown;
  onChange: (v: string[]) => void;
}) {
  const items = Array.isArray(value) ? value.map(String) : [];
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest ml-1">
        {name}
      </label>
      <ChipInput
        value={items}
        onChange={onChange}
        placeholder={def.description}
        aria-label={name}
      />
    </div>
  );
}

/**
 * Render a single template field based on its type definition.
 */
function TemplateFieldWidget({
  name,
  def,
  value,
  required,
  onChange,
}: {
  name: string;
  def: TemplateFieldDef;
  value: unknown;
  required: boolean;
  onChange: (fieldName: string, value: unknown) => void;
}) {
  switch (def.type) {
    case 'string':
      return (
        <StringField
          name={name}
          def={def}
          value={value}
          required={required}
          onChange={(v) => onChange(name, v)}
        />
      );
    case 'number':
      return (
        <NumberField name={name} def={def} value={value} onChange={(v) => onChange(name, v)} />
      );
    case 'boolean':
      return (
        <BooleanField name={name} def={def} value={value} onChange={(v) => onChange(name, v)} />
      );
    case 'string[]':
    case 'number[]':
    case 'boolean[]':
      return <ArrayField name={name} def={def} value={value} onChange={(v) => onChange(name, v)} />;
    default:
      return (
        <StringField
          name={name}
          def={def}
          value={value}
          required={required}
          onChange={(v) => onChange(name, v)}
        />
      );
  }
}

export function TemplateFields({ fields, values, onChange, requiredFields }: TemplateFieldsProps) {
  const required = new Set(requiredFields ?? []);
  const entries = Object.entries(fields);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
        Template Fields
      </h3>
      {entries.map(([name, def]) => (
        <TemplateFieldWidget
          key={name}
          name={name}
          def={def}
          value={values[name]}
          required={required.has(name)}
          onChange={onChange}
        />
      ))}
    </div>
  );
}
