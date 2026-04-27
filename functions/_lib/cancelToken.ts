/**
 * HMAC-SHA256 token gating visitor-initiated booking cancellation.
 *
 * The cancel link in a visitor's confirmation email is just
 * `/booking/cancel?id=<bookingId>&t=<token>`. The booking row's UUID is
 * already unguessable on its own, but signing it with `AUTH_SECRET` means
 * we never have to put the token in a database column or trust an
 * accidentally-leaked booking id (e.g. a screenshot of the email).
 */

const ENC = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    ENC.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, ENC.encode(payload));
  return base64url(new Uint8Array(sig));
}

async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function makeCancelToken(secret: string, bookingId: string): Promise<string> {
  return sign(secret, `cancel:${bookingId}`);
}

export async function verifyCancelToken(
  secret: string,
  bookingId: string,
  token: string,
): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0) return false;
  return constantTimeEqual(await makeCancelToken(secret, bookingId), token);
}

/**
 * Confirm tokens use a different payload prefix from cancel tokens so a
 * leaked link from one channel can't be used for the other. Visitor
 * confirmation emails embed the confirm token; the post-confirm
 * notification email embeds the cancel token.
 */
export async function makeConfirmToken(secret: string, bookingId: string): Promise<string> {
  return sign(secret, `confirm:${bookingId}`);
}

export async function verifyConfirmToken(
  secret: string,
  bookingId: string,
  token: string,
): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0) return false;
  return constantTimeEqual(await makeConfirmToken(secret, bookingId), token);
}
