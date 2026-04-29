export function AmountCell({ amount }: { amount: number }) {
  const isNegative = amount < 0;
  return (
    <div className="text-right font-mono font-medium tabular-nums">
      <span className={isNegative ? 'text-destructive' : 'text-success'}>
        {isNegative ? '-' : '+'}${Math.abs(amount).toFixed(2)}
      </span>
    </div>
  );
}

export function DescriptionCell({
  description,
  entityName,
}: {
  description: string;
  entityName?: string | null;
}) {
  return (
    <div className="max-w-md">
      <div className="font-medium truncate">{description}</div>
      {entityName && <div className="text-sm text-muted-foreground truncate">{entityName}</div>}
    </div>
  );
}
