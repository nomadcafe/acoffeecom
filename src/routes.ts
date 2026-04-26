/** URL path segment (without locale prefix) for the standalone passport page. */
export const PASSPORT_PATH = '/passport';

export function isPassportPath(logicalPath: string): boolean {
  return logicalPath === PASSPORT_PATH || logicalPath.startsWith(`${PASSPORT_PATH}/`);
}

/** URL path segment (without locale prefix) for the user account page. */
export const ACCOUNT_PATH = '/account';

export function isAccountPath(logicalPath: string): boolean {
  return logicalPath === ACCOUNT_PATH || logicalPath.startsWith(`${ACCOUNT_PATH}/`);
}
