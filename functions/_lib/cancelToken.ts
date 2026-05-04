/**
 * HMAC-SHA256 tokens gating visitor-initiated booking confirm + cancel.
 *
 * The cancel link in a visitor's confirmation email is just
 * `/booking/cancel?id=<bookingId>&t=<token>`; the booking row's UUID is
 * already unguessable on its own, but signing it with `AUTH_SECRET` means
 * we never have to put the token in a database column or trust an
 * accidentally-leaked booking id (e.g. a screenshot of the email).
 *
 * Tokens are not pure HMACs — they embed an absolute expiry timestamp so
 * a leaked email URL stops working after a finite window. Token format:
 *
 *     <expiresAt(ms,base36)>.<base64url(hmac)>
 *
 * The HMAC payload is `<prefix>:<bookingId>:<expiresAt>` — same prefix
 * that domain-separates confirm vs cancel. Verify parses the expiry,
 * rejects past timestamps, then recomputes + compares the HMAC with the
 * exact `expiresAt` the token claims.
 *
 * Single-use is enforced by the booking state machine (status flips on
 * confirm/cancel), not at token level.
 */

import { hmacSign, constantTimeEqual } from './hmac';

async function makeToken(
  secret: string,
  prefix: 'cancel' | 'confirm',
  bookingId: string,
  expiresAt: number,
): Promise<string> {
  const exp = Math.floor(expiresAt).toString(36);
  const sig = await hmacSign(secret, `${prefix}:${bookingId}:${exp}`);
  return `${exp}.${sig}`;
}

async function verifyToken(
  secret: string,
  prefix: 'cancel' | 'confirm',
  bookingId: string,
  token: string,
): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0) return false;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return false;
  const expRaw = token.slice(0, dot);
  const sigClaim = token.slice(dot + 1);
  const expiresAt = parseInt(expRaw, 36);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return false;
  if (Date.now() >= expiresAt) return false;
  const expected = await hmacSign(secret, `${prefix}:${bookingId}:${expRaw}`);
  return constantTimeEqual(expected, sigClaim);
}

export async function makeCancelToken(
  secret: string,
  bookingId: string,
  expiresAt: number,
): Promise<string> {
  return makeToken(secret, 'cancel', bookingId, expiresAt);
}

export async function verifyCancelToken(
  secret: string,
  bookingId: string,
  token: string,
): Promise<boolean> {
  return verifyToken(secret, 'cancel', bookingId, token);
}

export async function makeConfirmToken(
  secret: string,
  bookingId: string,
  expiresAt: number,
): Promise<string> {
  return makeToken(secret, 'confirm', bookingId, expiresAt);
}

export async function verifyConfirmToken(
  secret: string,
  bookingId: string,
  token: string,
): Promise<boolean> {
  return verifyToken(secret, 'confirm', bookingId, token);
}
