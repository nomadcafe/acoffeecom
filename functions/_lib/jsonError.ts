/**
 * Tiny error-response helpers — kept in their own module (no auth /
 * Resend / DB imports) so public read endpoints that only need
 * `jsonError` don't transitively pull in the Better Auth + Resend SDKs
 * via passport.ts. Saves cold-start parse time on hot public paths.
 *
 * `passport.ts` re-exports these for backwards compatibility, so older
 * call sites that import { jsonError } from passport keep working.
 */

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * Like jsonError but includes a stable `code` field so the client can
 * pick a localized string instead of displaying the server's English
 * `error` verbatim. Use for failure modes the UI wants to render with
 * advice or specific copy (e.g. "addresses too far apart" + suggestion
 * to try closer locations).
 */
export function jsonErrorCoded(
  message: string,
  code: string,
  status: number,
  extra?: Record<string, unknown>,
): Response {
  return Response.json({ error: message, code, ...extra }, { status });
}
