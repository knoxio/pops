export interface BootstrapLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

function writeWarn(msg: string, meta?: Record<string, unknown>): void {
  if (meta !== undefined) {
    console.warn(msg, meta);
    return;
  }
  console.warn(msg);
}

function writeError(msg: string, meta?: Record<string, unknown>): void {
  if (meta !== undefined) {
    console.error(msg, meta);
    return;
  }
  console.error(msg);
}

export function consoleLogger(): BootstrapLogger {
  return {
    info: writeWarn,
    warn: writeWarn,
    error: writeError,
  };
}
