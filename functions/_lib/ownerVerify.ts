/**
 * Owner auto-verification: do the host part of the user's account email
 * and the host of the cafe's website match?
 *
 * Used when a user marks a featured cafe with `relation = 'owned'`. If
 * their account email is at the same domain as the cafe's website, we
 * flip the cafe row's `ownerVerified` flag and the public profile shows
 * a ✓ next to "I run this café." The reverse-link chip on Places search
 * results also uses this — verified owners get "owned by @user," everyone
 * else stays at "shared by @user."
 *
 * Trust model: this is a "yeah, probably them" signal, not a strong
 * assertion. We don't pull a public-suffix list to compute the registrable
 * domain — instead, we accept exact-match or one host being a subdomain
 * of the other. False-positive risk: a cafe at `x.com` with the website
 * pointed at `evil.x.com` would auto-verify any `@x.com` user. Acceptable
 * for v1 because (a) it requires the cafe to actively be at a hostile
 * subdomain, (b) the worst outcome is a misleading badge, not data
 * exposure, and (c) we can swap in a stricter check later without API
 * changes.
 */

/** Lowercase host part of an email, or null if the email is malformed. */
function emailHost(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/** Lowercase host of a URL with leading `www.` stripped, or null if unparseable. */
function websiteHost(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    let host = url.host.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    return host || null;
  } catch {
    return null;
  }
}

/** Hosts match if equal or one is a strict subdomain of the other. */
function hostsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.endsWith('.' + b)) return true;
  if (b.endsWith('.' + a)) return true;
  return false;
}

/**
 * Returns true if the user's email domain plausibly matches the cafe's
 * website domain. Designed to be cheap (string ops only, no I/O) so we
 * can run it inside the account PATCH without slowing down the save.
 */
export function verifyOwnerByEmailDomain(
  userEmail: string | null | undefined,
  websiteUri: string | null | undefined,
): boolean {
  if (!userEmail || !websiteUri) return false;
  const eHost = emailHost(userEmail);
  const wHost = websiteHost(websiteUri);
  if (!eHost || !wHost) return false;
  return hostsMatch(eHost, wHost);
}
