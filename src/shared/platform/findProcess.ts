import rawFindProcess, { type ProcessInfo } from 'find-process';

type FindProcessFn = typeof rawFindProcess;

/**
 * Robust wrapper around find-process to handle ESM / CJS module interop
 * where find-process may be imported as either a function or an object with a default property.
 */
export const findProcess: FindProcessFn = ((...args: Parameters<FindProcessFn>) => {
  const resolved = (
    typeof rawFindProcess === 'function'
      ? rawFindProcess
      : (rawFindProcess as unknown as { default: FindProcessFn })?.default ?? rawFindProcess
  ) as FindProcessFn;

  return resolved(...args);
}) as FindProcessFn;

export default findProcess;
export type { ProcessInfo };
