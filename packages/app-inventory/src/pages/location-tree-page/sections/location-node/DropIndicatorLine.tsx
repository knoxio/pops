export function DropIndicatorLine({ depth }: { depth: number }) {
  return (
    <div
      className="relative h-0.5 my-[-1px] z-10"
      style={{
        marginLeft: `calc(${depth} * var(--tree-indent-step) + var(--tree-indent-base))`,
        marginRight: '8px',
      }}
      data-testid="drop-indicator"
    >
      <div className="absolute inset-0 bg-app-accent rounded-full" />
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-app-accent -ml-1" />
    </div>
  );
}
