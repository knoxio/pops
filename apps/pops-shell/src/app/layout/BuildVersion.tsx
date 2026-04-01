/** Faded mono build version label, shown next to the POPS logo. */
export function BuildVersion() {
  return (
    <span className="text-[10px] text-muted-foreground/50 font-mono">
      {__BUILD_VERSION__}
    </span>
  );
}
