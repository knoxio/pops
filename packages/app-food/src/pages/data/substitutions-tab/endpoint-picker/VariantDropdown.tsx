import { useTranslation } from 'react-i18next';

export interface VariantOption {
  id: number;
  slug: string;
  name: string;
}

export function VariantDropdown({
  variants,
  selectId,
  onPick,
}: {
  variants: readonly VariantOption[];
  selectId: string;
  onPick: (variantId: number) => void;
}) {
  const { t } = useTranslation('food');
  if (variants.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">{t('data.substitutions.endpoint.noVariants')}</p>
    );
  }
  return (
    <select
      id={selectId}
      onChange={(e) => {
        const id = Number(e.target.value);
        if (Number.isFinite(id) && id > 0) onPick(id);
      }}
      defaultValue=""
      className="border-input bg-background h-9 rounded-md border px-3 text-sm"
      aria-label={t('data.substitutions.endpoint.variantPickerAria')}
    >
      <option value="" disabled>
        {t('data.substitutions.endpoint.variantPickerPlaceholder')}
      </option>
      {variants.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name} ({v.slug})
        </option>
      ))}
    </select>
  );
}
