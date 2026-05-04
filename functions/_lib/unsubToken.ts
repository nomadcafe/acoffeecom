/**
 * Unsubscribe tokens for one-click email opt-out (RFC 8058 / Gmail
 * bulk-sender rules). Unlike booking confirm/cancel tokens these have
 * no expiry — RFC says unsubscribe links must keep working — and the
 * action they grant (flipping a boolean off) is one-way and undoable
 * via /account, so replay is harmless.
 *
 * `kind` lets us add other unsubscribe surfaces later (transactional
 * vs marketing) without aliasing tokens across them.
 */

import { hmacSign, constantTimeEqual } from './hmac';

export type UnsubKind = 'recap';

export async function makeUnsubToken(
  secret: string,
  kind: UnsubKind,
  userId: string,
): Promise<string> {
  return hmacSign(secret, `unsub:${kind}:${userId}`);
}

export async function verifyUnsubToken(
  secret: string,
  kind: UnsubKind,
  userId: string,
  token: string,
): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0) return false;
  const expected = await hmacSign(secret, `unsub:${kind}:${userId}`);
  return constantTimeEqual(expected, token);
}
