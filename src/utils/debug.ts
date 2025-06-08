export const isDebug = (): boolean =>
  Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) &&
  (typeof window === 'undefined' || localStorage.getItem('debugDelete') === '1');

export function logDebug(...args: unknown[]) {
  if (isDebug()) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}
