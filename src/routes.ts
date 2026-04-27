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

/** URL path segment (without locale prefix) for the organizer's bookings page. */
export const BOOKINGS_PATH = '/bookings';

export function isBookingsPath(logicalPath: string): boolean {
  return logicalPath === BOOKINGS_PATH || logicalPath.startsWith(`${BOOKINGS_PATH}/`);
}

/** Same shape the server enforces in functions/_lib/username.ts.
 *  Anything matching this AND not already a known route is a profile slug. */
const USERNAME_PATH_REGEX = /^\/([a-z][a-z0-9_-]{2,29})$/;

/** Returns the username when `logicalPath` looks like a public profile URL,
 *  or null when it matches no real user (caller still has to verify by
 *  hitting the profile API). */
export function matchProfileUsername(logicalPath: string): string | null {
  const m = logicalPath.match(USERNAME_PATH_REGEX);
  return m ? m[1] : null;
}
