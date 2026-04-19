export function AmbientBackground() {
  return (
    <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0 opacity-20 dark:opacity-10">
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-app-accent/20 blur-[120px]" />
      <div className="absolute bottom-[-5%] left-[-5%] w-[30%] h-[30%] rounded-full bg-app-accent/10 blur-[100px]" />
    </div>
  );
}
