/** URL path segment (without locale prefix) for the standalone passport page. */
export const PASSPORT_PATH = '/passport';

export function isPassportPath(logicalPath: string): boolean {
  return logicalPath === PASSPORT_PATH || logicalPath.startsWith(`${PASSPORT_PATH}/`);
}
